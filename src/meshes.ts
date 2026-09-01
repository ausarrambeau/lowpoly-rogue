/** Low-poly mesh factories built from primitives with flat shading. No external assets. */
import * as THREE from 'three';
import { RARITY_COLOR, type ItemDrop } from './items';
import type { EnemyDef } from './stats';
import type { RNG } from './rng';

export interface MatOpts {
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
}

export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: o.roughness ?? 0.85,
    metalness: o.metalness ?? 0.05,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
  });
}

function shadowed<T extends THREE.Mesh>(m: T, x = 0, y = 0, z = 0): T {
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh =>
  shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);

export const ico = (r: number, m: THREE.Material, x = 0, y = 0, z = 0, detail = 0): THREE.Mesh =>
  shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m), x, y, z);

export const cyl = (rt: number, rb: number, h: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh =>
  shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), x, y, z);

export const cone = (r: number, h: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh =>
  shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m), x, y, z);

/* ---------------------------------- hero ---------------------------------- */

export interface HeroParts {
  group: THREE.Group;
  body: THREE.Mesh;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  tunic: THREE.MeshStandardMaterial;
}

export function makeHero(): HeroParts {
  const g = new THREE.Group();
  const tunic = mat(0x3b6fd6);
  const skin = mat(0xf1c27d);
  const pants = mat(0x2b2f4a);
  const boots = mat(0x4a2e1a);
  const steel = mat(0xdde3ea, { metalness: 0.55, roughness: 0.35 });
  const gold = mat(0xc9a227, { metalness: 0.6, roughness: 0.4 });
  const leather = mat(0x5a3a1a);
  const dark = mat(0x111111);

  const leg = (x: number): THREE.Group => {
    const grp = new THREE.Group();
    grp.position.set(x, 0.5, 0);
    grp.add(box(0.2, 0.36, 0.22, pants, 0, -0.18, 0));
    grp.add(box(0.22, 0.14, 0.27, boots, 0, -0.43, 0.02));
    return grp;
  };
  const legL = leg(-0.14);
  const legR = leg(0.14);
  const body = box(0.56, 0.6, 0.34, tunic, 0, 0.8, 0);
  g.add(legL, legR, body);
  g.add(box(0.58, 0.08, 0.36, leather, 0, 0.53, 0));
  g.add(ico(0.26, skin, 0, 1.38, 0));
  g.add(box(0.5, 0.16, 0.5, mat(0x3a2416), 0, 1.56, -0.02));
  g.add(box(0.06, 0.06, 0.04, dark, -0.09, 1.4, 0.24));
  g.add(box(0.06, 0.06, 0.04, dark, 0.09, 1.4, 0.24));

  const armL = new THREE.Group();
  armL.position.set(-0.38, 1.02, 0);
  armL.add(box(0.16, 0.5, 0.16, tunic, 0, -0.25, 0));
  armL.add(ico(0.09, skin, 0, -0.52, 0));

  const armR = new THREE.Group();
  armR.position.set(0.38, 1.02, 0);
  armR.add(box(0.16, 0.5, 0.16, tunic, 0, -0.25, 0));
  armR.add(ico(0.09, skin, 0, -0.52, 0));
  armR.add(box(0.07, 0.18, 0.07, leather, 0, -0.5, 0));
  armR.add(box(0.3, 0.06, 0.1, gold, 0, -0.62, 0));
  armR.add(box(0.09, 0.95, 0.04, steel, 0, -1.12, 0));
  armR.rotation.x = -0.9;
  g.add(armL, armR);
  return { group: g, body, legL, legR, armL, armR, tunic };
}

/* --------------------------------- enemies -------------------------------- */

export interface EnemyParts {
  mats: THREE.MeshStandardMaterial[];
  body?: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  armR?: THREE.Object3D;
  wingL?: THREE.Object3D;
  wingR?: THREE.Object3D;
}

export function makeEnemy(def: EnemyDef): { group: THREE.Group; parts: EnemyParts } {
  switch (def.id) {
    case 'slime':
      return makeSlime(def.color);
    case 'bat':
      return makeBat(def.color);
    case 'skeleton':
      return makeSkeleton(def.color, 1, false);
    case 'boss':
      return makeSkeleton(def.color, 2.1, true);
  }
}

function makeSlime(color: number): { group: THREE.Group; parts: EnemyParts } {
  const m = mat(color, { roughness: 0.45 });
  const g = new THREE.Group();
  const body = ico(0.5, m, 0, 0.42, 0);
  body.scale.set(1, 0.78, 1);
  const eye = mat(0x111111);
  g.add(body, ico(0.07, eye, -0.17, 0.5, 0.42), ico(0.07, eye, 0.17, 0.5, 0.42));
  return { group: g, parts: { mats: [m], body } };
}

function makeBat(color: number): { group: THREE.Group; parts: EnemyParts } {
  const m = mat(color);
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.1;
  body.add(ico(0.22, m));
  body.add(cone(0.07, 0.18, 4, m, -0.1, 0.26, 0), cone(0.07, 0.18, 4, m, 0.1, 0.26, 0));
  const eye = mat(0xff2020, { emissive: 0xff2020, emissiveIntensity: 2 });
  body.add(ico(0.05, eye, -0.08, 0.04, 0.19), ico(0.05, eye, 0.08, 0.04, 0.19));
  const wingL = new THREE.Group();
  wingL.position.set(-0.18, 0.02, 0);
  wingL.add(box(0.55, 0.03, 0.3, m, -0.28, 0, 0));
  const wingR = new THREE.Group();
  wingR.position.set(0.18, 0.02, 0);
  wingR.add(box(0.55, 0.03, 0.3, m, 0.28, 0, 0));
  body.add(wingL, wingR);
  g.add(body);
  return { group: g, parts: { mats: [m], body, wingL, wingR } };
}

function makeSkeleton(color: number, scale: number, boss: boolean): { group: THREE.Group; parts: EnemyParts } {
  const bone = mat(color, { roughness: 0.7 });
  const dark = mat(0x2a2230);
  const g = new THREE.Group();
  const leg = (x: number): THREE.Group => {
    const grp = new THREE.Group();
    grp.position.set(x, 0.5, 0);
    grp.add(box(0.12, 0.48, 0.12, bone, 0, -0.24, 0));
    return grp;
  };
  const legL = leg(-0.12);
  const legR = leg(0.12);
  g.add(box(0.36, 0.14, 0.2, bone, 0, 0.56, 0));
  const torso = box(0.44, 0.46, 0.24, bone, 0, 0.88, 0);
  g.add(torso);
  for (let i = 0; i < 3; i++) g.add(box(0.46, 0.04, 0.26, dark, 0, 0.74 + i * 0.12, 0));
  g.add(ico(0.22, bone, 0, 1.33, 0));
  const eyeColor = boss ? 0xff3030 : 0x60c0ff;
  const eye = mat(eyeColor, { emissive: eyeColor, emissiveIntensity: 2.2 });
  g.add(ico(0.05, eye, -0.08, 1.36, 0.19), ico(0.05, eye, 0.08, 1.36, 0.19));

  const armL = new THREE.Group();
  armL.position.set(-0.3, 1.08, 0);
  armL.add(box(0.11, 0.5, 0.11, bone, 0, -0.25, 0));
  armL.rotation.x = 0.3;
  const armR = new THREE.Group();
  armR.position.set(0.3, 1.08, 0);
  armR.add(box(0.11, 0.5, 0.11, bone, 0, -0.25, 0));
  if (boss) {
    const metal = mat(0xb8b0a0, { metalness: 0.5, roughness: 0.4 });
    armR.add(box(0.2, 1.1, 0.06, metal, 0.02, -1.0, 0));
    armR.add(box(0.3, 0.08, 0.1, mat(0x3a2a20), 0, -0.55, 0));
    const gold = mat(0xd8a832, { metalness: 0.7, roughness: 0.35 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(cone(0.06, 0.16, 4, gold, Math.cos(a) * 0.16, 1.56, Math.sin(a) * 0.16));
    }
    g.add(box(0.5, 0.8, 0.06, mat(0x7a1020), 0, 0.85, -0.17));
  } else {
    armR.add(box(0.07, 0.7, 0.04, mat(0x8a7f6a, { metalness: 0.4, roughness: 0.5 }), 0, -0.85, 0));
    armR.add(box(0.2, 0.05, 0.08, mat(0x3a2a20), 0, -0.52, 0));
  }
  armR.rotation.x = -0.7;
  g.add(legL, legR, armL, armR);
  g.scale.setScalar(scale);
  return { group: g, parts: { mats: [bone], legL, legR, armR, body: torso } };
}

/* --------------------------------- pickups -------------------------------- */

export function makePickup(drop: ItemDrop): THREE.Group {
  const g = new THREE.Group();
  const def = drop.def;
  const color = def.kind === 'gold' ? 0xffc233 : RARITY_COLOR[def.rarity];
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const spin = new THREE.Group();
  spin.name = 'spin';
  g.add(spin);

  switch (def.kind) {
    case 'gold': {
      const gm = mat(0xffc233, { metalness: 0.7, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.5 });
      const n = drop.amount > 12 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const c = cyl(0.13, 0.13, 0.05, 8, gm, Math.cos(i * 2.1) * 0.14, 0.03 + i * 0.055, Math.sin(i * 2.1) * 0.14);
        c.rotation.y = i * 0.7;
        spin.add(c);
      }
      break;
    }
    case 'potion': {
      spin.add(ico(0.17, mat(0xe0303a, { emissive: 0x7a0010, emissiveIntensity: 0.7, roughness: 0.3 }), 0, 0.22, 0));
      spin.add(cyl(0.06, 0.06, 0.12, 6, mat(0xd9d9e0), 0, 0.4, 0));
      spin.add(cyl(0.05, 0.05, 0.06, 6, mat(0x8a5a2a), 0, 0.49, 0));
      break;
    }
    case 'weapon': {
      const blade = mat(0xdde3ea, { metalness: 0.55, roughness: 0.35, emissive: color, emissiveIntensity: 0.35 });
      const sword = new THREE.Group();
      sword.add(box(0.08, 0.8, 0.04, blade, 0, 0.5, 0));
      sword.add(box(0.28, 0.06, 0.08, mat(0xc9a227, { metalness: 0.6, roughness: 0.4 }), 0, 0.08, 0));
      sword.add(box(0.06, 0.18, 0.06, mat(0x5a3a1a), 0, -0.05, 0));
      sword.rotation.z = 0.7;
      sword.position.y = 0.2;
      spin.add(sword);
      break;
    }
    case 'armor': {
      const m = mat(0x9a9aa8, { metalness: 0.5, roughness: 0.4, emissive: color, emissiveIntensity: 0.3 });
      spin.add(box(0.46, 0.4, 0.28, m, 0, 0.3, 0));
      spin.add(box(0.16, 0.12, 0.3, m, -0.3, 0.46, 0), box(0.16, 0.12, 0.3, m, 0.3, 0.46, 0));
      break;
    }
  }
  return g;
}

/* ---------------------------------- props --------------------------------- */

export function makeChest(): { group: THREE.Group; lid: THREE.Group } {
  const g = new THREE.Group();
  const wood = mat(0x7a4a1e);
  const trim = mat(0xc9a227, { metalness: 0.6, roughness: 0.4 });
  g.add(box(0.95, 0.5, 0.62, wood, 0, 0.25, 0));
  g.add(box(0.98, 0.08, 0.66, trim, 0, 0.12, 0), box(0.98, 0.08, 0.66, trim, 0, 0.4, 0));
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -0.31);
  lid.add(box(0.95, 0.28, 0.62, mat(0x8f5a28), 0, 0.14, 0.31));
  lid.add(box(0.14, 0.14, 0.08, trim, 0, 0.1, 0.63));
  g.add(lid);
  return { group: g, lid };
}

export function makeTorch(color: number, withLight: boolean): { group: THREE.Group; flame: THREE.Mesh; light: THREE.PointLight | null } {
  const g = new THREE.Group();
  g.add(box(0.14, 0.14, 0.24, mat(0x3a3a44, { metalness: 0.5 }), 0, 0, -0.1));
  const stick = cyl(0.04, 0.06, 0.55, 6, mat(0x5a3a1a), 0, 0.2, 0.06);
  stick.rotation.x = -0.35;
  g.add(stick);
  const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  flame.position.set(0, 0.55, 0.16);
  g.add(flame);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
  core.position.copy(flame.position);
  g.add(core);
  let light: THREE.PointLight | null = null;
  if (withLight) {
    light = new THREE.PointLight(color, 28, 12, 2);
    light.position.set(0, 0.7, 0.5);
    g.add(light);
  }
  return { group: g, flame, light };
}

export function makeStairs(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0x2c3140);
  g.add(box(2, 0.3, 2, mat(0x05060c), 0, -0.6, 0));
  for (let i = 0; i < 3; i++) g.add(box(2, 0.3, 0.6, stone, 0, -0.15 - i * 0.3, -0.7 + i * 0.6));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.05, 24),
    new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.name = 'glow';
  g.add(ring);
  const light = new THREE.PointLight(0x7fe0ff, 8, 7, 2);
  light.position.y = 1;
  g.add(light);
  return g;
}

export interface PortalMeshes {
  group: THREE.Group;
  ring: THREE.Mesh;
  disc: THREE.Mesh;
  light: THREE.PointLight;
}

export function makePortal(): PortalMeshes {
  const g = new THREE.Group();
  const ringMat = mat(0x3a3050, { emissive: 0x000000, metalness: 0.4, roughness: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.14, 6, 18), ringMat);
  ring.position.y = 1.15;
  ring.castShadow = true;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 18),
    new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  disc.position.y = 1.15;
  g.add(ring, disc);
  g.add(cyl(0.3, 0.4, 0.3, 6, mat(0x2a2438), 0, 0.15, 0));
  const light = new THREE.PointLight(0x9b5cff, 0, 9, 2);
  light.position.y = 1.4;
  g.add(light);
  return { group: g, ring, disc, light };
}

export type PropKind = 'barrel' | 'crate' | 'pillar' | 'rubble';

export function makeProp(kind: PropKind, rng: RNG): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'barrel': {
      const wood = mat(0x6b4423);
      g.add(cyl(0.34, 0.3, 0.75, 8, wood, 0, 0.375, 0));
      const band = mat(0x3a3a44, { metalness: 0.5 });
      g.add(cyl(0.36, 0.36, 0.06, 8, band, 0, 0.2, 0), cyl(0.36, 0.36, 0.06, 8, band, 0, 0.55, 0));
      break;
    }
    case 'crate': {
      const wood = mat(0x8b6a3e);
      g.add(box(0.75, 0.75, 0.75, wood, 0, 0.375, 0));
      g.add(box(0.8, 0.08, 0.8, mat(0x5a3a1a), 0, 0.375, 0));
      break;
    }
    case 'pillar': {
      const stone = mat(0x6a7188);
      g.add(cyl(0.34, 0.42, 2.8, 6, stone, 0, 1.4, 0));
      g.add(box(1.0, 0.2, 1.0, stone, 0, 2.9, 0), box(1.0, 0.16, 1.0, stone, 0, 0.08, 0));
      break;
    }
    case 'rubble': {
      const stone = mat(0x5a6074);
      for (let i = 0; i < 4; i++) {
        const r = 0.14 + rng() * 0.18;
        g.add(ico(r, stone, (rng() - 0.5) * 0.9, r * 0.8, (rng() - 0.5) * 0.9));
      }
      break;
    }
  }
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}
