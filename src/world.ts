/** Turns a Dungeon grid into Three.js geometry: instanced floors/walls, torches, props, lights. */
import * as THREE from 'three';
import { FLOOR, WALL } from './grid';
import { idx, randomTileInRoom, type Dungeon, type Point, type Room } from './dungeon';
import { pick, randInt, shuffle, type RNG } from './rng';
import { TILE, toWorld, type Grid } from './physics';
import { makePortal, makeProp, makeStairs, makeTorch, type PortalMeshes, type PropKind } from './meshes';
import { FLOOR_COUNT } from './stats';

export interface Theme {
  name: string;
  floorA: number;
  floorB: number;
  wall: number;
  fog: number;
  fogDensity: number;
  ambient: number;
  moon: number;
  torchLights: number;
  torchColor: number;
}

export const THEMES: Record<number, Theme> = {
  1: { name: 'The Catacombs', floorA: 0x4b5568, floorB: 0x39404f, wall: 0x5b6478, fog: 0x0b0d16, fogDensity: 0.024, ambient: 0x3a4468, moon: 0x7f93d8, torchLights: 12, torchColor: 0xff9a3c },
  2: { name: 'The Bone Throne', floorA: 0x4a2c33, floorB: 0x37202a, wall: 0x5a2f39, fog: 0x120608, fogDensity: 0.028, ambient: 0x4a2a30, moon: 0xb0607a, torchLights: 14, torchColor: 0xff6a2c },
};

export interface Torch {
  flame: THREE.Mesh;
  light: THREE.PointLight | null;
  phase: number;
  base: number;
}

export interface World {
  group: THREE.Group;
  grid: Grid;
  theme: Theme;
  torches: Torch[];
  stairs: THREE.Group | null;
  portal: PortalMeshes | null;
  dispose(): void;
}

const PROP_KINDS: PropKind[] = ['barrel', 'crate', 'pillar', 'rubble', 'barrel', 'crate'];

/** Random passable tile inside a room that the caller's `avoid` predicate accepts. */
export function randomSpawnTile(rng: RNG, room: Room, grid: Grid, avoid: (i: number) => boolean): Point | null {
  for (let k = 0; k < 30; k++) {
    const t = randomTileInRoom(rng, room);
    const i = t.y * grid.width + t.x;
    if (grid.solid[i] !== FLOOR || avoid(i)) continue;
    return t;
  }
  return null;
}

function jitterColor(c: THREE.Color, base: number, rng: RNG, amount: number): THREE.Color {
  c.setHex(base);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h + (rng() - 0.5) * 0.02, hsl.s, hsl.l + (rng() - 0.5) * amount);
  return c;
}

export function buildWorld(scene: THREE.Scene, d: Dungeon, rng: RNG): World {
  const theme = THEMES[d.floor] ?? THEMES[1];
  const group = new THREE.Group();
  const grid: Grid = { solid: Uint8Array.from(d.tiles), width: d.width, height: d.height };
  const stairsRoom = d.rooms.find((r) => r.cx === d.stairs.x && r.cy === d.stairs.y) ?? d.rooms[d.rooms.length - 1];
  const nearKey = (t: Point, p: Point) => Math.abs(t.x - p.x) + Math.abs(t.y - p.y) < 3;

  // Props block movement: mark their tiles solid in the runtime grid (the Dungeon itself stays pure).
  for (const room of d.rooms) {
    if (room === d.rooms[0] || room === stairsRoom) continue;
    const n = randInt(rng, 0, room.w * room.h >= 30 ? 2 : 1);
    for (let k = 0; k < n; k++) {
      const t = randomTileInRoom(rng, room);
      const i = idx(d, t.x, t.y);
      if (grid.solid[i] !== FLOOR || nearKey(t, d.start) || nearKey(t, d.stairs)) continue;
      grid.solid[i] = WALL;
      const prop = makeProp(pick(rng, PROP_KINDS), rng);
      prop.position.set(toWorld(t.x), 0, toWorld(t.y));
      group.add(prop);
    }
  }

  // Floor tiles (instanced). The stairs tile on non-final floors is a pit, so it gets no tile.
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  const skipStairsTile = d.floor < FLOOR_COUNT;
  const floorTiles: number[] = [];
  const wallTiles: number[] = [];
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      const i = idx(d, x, y);
      if (d.tiles[i] === FLOOR) {
        if (!(skipStairsTile && x === d.stairs.x && y === d.stairs.y)) floorTiles.push(i);
        continue;
      }
      let exposed = false;
      for (let oy = -1; oy <= 1 && !exposed; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < d.width && ny < d.height && d.tiles[idx(d, nx, ny)] === FLOOR) {
            exposed = true;
            break;
          }
        }
      if (exposed) wallTiles.push(i);
    }
  }

  const floorMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TILE, 0.3, TILE),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }),
    floorTiles.length,
  );
  floorTiles.forEach((i, n) => {
    const x = i % d.width;
    const y = (i - x) / d.width;
    dummy.position.set(toWorld(x), -0.15 + (rng() - 0.5) * 0.04, toWorld(y));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    floorMesh.setMatrixAt(n, dummy.matrix);
    floorMesh.setColorAt(n, jitterColor(color, rng() < 0.5 ? theme.floorA : theme.floorB, rng, 0.06));
  });
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const wallMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TILE, 1, TILE),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    wallTiles.length,
  );
  wallTiles.forEach((i, n) => {
    const x = i % d.width;
    const y = (i - x) / d.width;
    const h = 2.4 + rng() * 0.7;
    dummy.position.set(toWorld(x), h / 2 - 0.3, toWorld(y));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    wallMesh.setMatrixAt(n, dummy.matrix);
    wallMesh.setColorAt(n, jitterColor(color, theme.wall, rng, 0.08));
  });
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // Torches on room walls: candidate (wallTile, facing) pairs, shuffled; the first N carry real lights.
  type Cand = { x: number; y: number; rot: number; ox: number; oz: number };
  const cands: Cand[] = [];
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < d.width && y < d.height && d.tiles[idx(d, x, y)] === WALL;
  for (const r of d.rooms) {
    const xs = [...new Set([r.x + 1, r.x + r.w - 2])];
    const ys = [...new Set([r.y + 1, r.y + r.h - 2])];
    for (const x of xs) {
      if (isWall(x, r.y - 1)) cands.push({ x, y: r.y - 1, rot: 0, ox: 0, oz: 1.08 });
      if (isWall(x, r.y + r.h)) cands.push({ x, y: r.y + r.h, rot: Math.PI, ox: 0, oz: -1.08 });
    }
    for (const y of ys) {
      if (isWall(r.x - 1, y)) cands.push({ x: r.x - 1, y, rot: Math.PI / 2, ox: 1.08, oz: 0 });
      if (isWall(r.x + r.w, y)) cands.push({ x: r.x + r.w, y, rot: -Math.PI / 2, ox: -1.08, oz: 0 });
    }
  }
  shuffle(rng, cands);
  const torches: Torch[] = [];
  cands.slice(0, theme.torchLights + 10).forEach((c, n) => {
    const t = makeTorch(theme.torchColor, n < theme.torchLights);
    t.group.position.set(toWorld(c.x) + c.ox, 1.5, toWorld(c.y) + c.oz);
    t.group.rotation.y = c.rot;
    group.add(t.group);
    torches.push({ flame: t.flame, light: t.light, phase: rng() * 10, base: t.light?.intensity ?? 0 });
  });

  // Exit: a stairwell on early floors, a dormant portal on the last one.
  let stairs: THREE.Group | null = null;
  let portal: PortalMeshes | null = null;
  if (d.floor < FLOOR_COUNT) {
    stairs = makeStairs();
    stairs.position.set(toWorld(d.stairs.x), 0, toWorld(d.stairs.y));
    group.add(stairs);
  } else {
    portal = makePortal();
    portal.group.position.set(toWorld(d.stairs.x), 0, toWorld(d.stairs.y));
    group.add(portal.group);
  }

  // Lights: dim ambient + cool "moon" directional with shadows; torches carry the warmth.
  group.add(new THREE.AmbientLight(theme.ambient, 1.0));
  group.add(new THREE.HemisphereLight(0x5060a0, 0x101010, 0.5));
  const moon = new THREE.DirectionalLight(theme.moon, 1.6);
  const cx = toWorld(d.width / 2);
  const cz = toWorld(d.height / 2);
  moon.position.set(cx + 30, 60, cz + 20);
  moon.target.position.set(cx, 0, cz);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const ext = (Math.max(d.width, d.height) * TILE) / 2 + 6;
  moon.shadow.camera.left = -ext;
  moon.shadow.camera.right = ext;
  moon.shadow.camera.top = ext;
  moon.shadow.camera.bottom = -ext;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 160;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.03;
  group.add(moon, moon.target);

  scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
  scene.background = new THREE.Color(theme.fog);
  scene.add(group);

  return {
    group,
    grid,
    theme,
    torches,
    stairs,
    portal,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      scene.remove(group);
    },
  };
}
