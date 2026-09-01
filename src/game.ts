/** The game: state machine, spawning, combat, loot, floors. Owns the Three.js scene. */
import * as THREE from 'three';
import { generateDungeon, type Dungeon } from './dungeon';
import { bfs, WALL } from './grid';
import { mulberry32, pick, randInt, type RNG } from './rng';
import { buildWorld, randomSpawnTile, THEMES, type World } from './world';
import { circleFree, flowStep, passableAt, slideMove, toTile, toWorld, type Vec2 } from './physics';
import { makeChest, makeEnemy, makeHero, makePickup, type EnemyParts, type HeroParts } from './meshes';
import { POTION, RARITY_COLOR, itemById, rollLoot, type ItemDef, type ItemDrop } from './items';
import {
  ENEMIES, FLOOR_COUNT, PLAYER_ATTACK_ARC, PLAYER_ATTACK_COOLDOWN, PLAYER_ATTACK_RANGE, PLAYER_MAX_HP,
  PLAYER_RADIUS, PLAYER_SPEED, applyDefense, floorSpawnTable, isUpgrade, rollDamage, type EnemyDef,
} from './stats';
import { Input } from './input';
import { HUD } from './hud';
import { FloatingText, Particles } from './fx';
import { sfx } from './audio';

const INVENTORY_CAP = 6;
const SWING_DURATION = 0.24;
const BOSS_SLAM_CD = 5.5;
const BOSS_SLAM_RADIUS = 3.6;
const BOSS_SLAM_DAMAGE = 30;
const REVEAL_RADIUS = 7;

type State = 'title' | 'playing' | 'transition' | 'dead' | 'victory';

interface Player {
  pos: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  gold: number;
  kills: number;
  weapon: ItemDef;
  armor: ItemDef | null;
  inventory: ItemDrop[];
  attackCd: number;
  swingT: number;
  invuln: number;
  moving: boolean;
}

interface Enemy {
  def: EnemyDef;
  hp: number;
  pos: Vec2;
  facing: number;
  group: THREE.Group;
  parts: EnemyParts;
  state: 'idle' | 'chase' | 'windup' | 'slam';
  timer: number;
  attackCd: number;
  flash: number;
  kb: Vec2;
  phase: number;
  slamCd: number;
  telegraph: THREE.Mesh | null;
}

interface Pickup {
  drop: ItemDrop;
  pos: Vec2;
  group: THREE.Group;
  phase: number;
  blockedT: number;
}

interface Chest {
  pos: Vec2;
  tile: { x: number; y: number };
  group: THREE.Group;
  lid: THREE.Group;
  opened: boolean;
  openT: number;
}

const rarityCss = (def: ItemDef): string => `#${RARITY_COLOR[def.rarity].toString(16).padStart(6, '0')}`;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private camTarget = new THREE.Vector3();
  private input: Input;
  private hud: HUD;
  private particles: Particles;
  private floating: FloatingText;

  private state: State = 'title';
  private rng: RNG = mulberry32(1);
  private seed = 1;
  private floor = 1;
  private dungeon!: Dungeon;
  private world: World | null = null;
  private player!: Player;
  private hero: HeroParts;
  private heroLight: THREE.PointLight;
  private heroDeadT = 0;

  private enemies: Enemy[] = [];
  private pickups: Pickup[] = [];
  private chests: Chest[] = [];
  private flowField: Int32Array = new Int32Array(0);
  private flowTimer = 0;
  private lastPlayerTile = -1;
  private explored = new Uint8Array(0);
  private portalActive = false;

  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
  private aimPoint = new THREE.Vector3();
  private camShake = 0;
  private time = 0;
  private last = performance.now();
  private mapTimer = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.5, 140);
    this.camera.position.set(0, 15, 10.5);

    this.input = new Input(container);
    this.hud = new HUD(container, INVENTORY_CAP);
    this.hud.onSlot = (i) => this.useSlot(i);
    this.hud.onOverlayClick = () => this.onOverlayClick();
    this.particles = new Particles(this.scene);
    this.floating = new FloatingText(this.hud.fxLayer, this.camera);

    this.hero = makeHero();
    this.hero.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.scene.add(this.hero.group);
    this.heroLight = new THREE.PointLight(0xffd2a0, 14, 11, 2);
    this.scene.add(this.heroLight);

    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });

    this.resetPlayer();
    this.showTitle();
    if (new URLSearchParams(location.search).has('debug')) this.exposeDebug();
    requestAnimationFrame(this.loop);
  }

  /** `?debug` only: lets a script inspect state and teleport, so a full run can be driven by real input events. */
  private exposeDebug(): void {
    const api = {
      status: () => ({
        state: this.state, floor: this.floor, seed: this.seed, hp: this.player.hp, gold: this.player.gold,
        kills: this.player.kills, enemies: this.enemies.length, pickups: this.pickups.length, portal: this.portalActive,
        weapon: this.player.weapon.id, armor: this.player.armor?.id ?? null,
        inventory: this.player.inventory.map((i) => `${i.def.id}x${i.amount}`),
      }),
      player: () => ({ ...this.player.pos, facing: this.player.facing, swingT: this.player.swingT, attackCd: this.player.attackCd }),
      aim: () => ({ x: this.aimPoint.x, z: this.aimPoint.z, ndc: { x: this.input.mouse.x, y: this.input.mouse.y }, mouseDown: this.input.mouseDown }),
      teleport: (x: number, z: number) => { this.player.pos.x = x; this.player.pos.z = z; },
      /** Advance the simulation by hand (rAF pauses in hidden tabs). */
      step: (n = 1, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) {
          this.update(dt);
          this.renderer.render(this.scene, this.camera);
          this.input.endFrame();
        }
      },
      stairs: () => ({ x: toWorld(this.dungeon.stairs.x), z: toWorld(this.dungeon.stairs.y) }),
      enemies: () => this.enemies.map((e) => ({ id: e.def.id, hp: e.hp, x: e.pos.x, z: e.pos.z, state: e.state })),
      chests: () => this.chests.map((c) => ({ x: c.pos.x, z: c.pos.z, opened: c.opened })),
      pickups: () => this.pickups.map((p) => ({ id: p.drop.def.id, amount: p.drop.amount, x: p.pos.x, z: p.pos.z })),
      free: (x: number, z: number) => circleFree(this.world!.grid, x, z, PLAYER_RADIUS),
      /** World point -> client pixel, so a script can aim with real mousemove events. */
      project: (x: number, y: number, z: number) => {
        const v = new THREE.Vector3(x, y, z).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        return { cx: r.left + ((v.x + 1) / 2) * r.width, cy: r.top + ((1 - v.y) / 2) * r.height };
      },
    };
    (window as unknown as { __rogue: typeof api }).__rogue = api;
  }

  /* ------------------------------ run lifecycle ------------------------------ */

  private showTitle(): void {
    this.hud.showOverlay(`
      <h1>Low Poly Rogue</h1>
      <p>Two floors. One life. Loot everything. The Bone King waits below.</p>
      <div class="keys">
        <b>WASD / Arrows</b><span>Move</span>
        <b>Mouse</b><span>Aim</span>
        <b>Click / Space</b><span>Attack</span>
        <b>1 – 6</b><span>Drink / equip inventory slot</span>
        <b>M</b><span>Mute</span>
        <b>R</b><span>Restart after death</span>
      </div>
      <div class="cta">Click to descend</div>`);
  }

  private onOverlayClick(): void {
    sfx.unlock();
    if (this.state === 'title' || this.state === 'dead' || this.state === 'victory') this.newRun();
  }

  private resetPlayer(): void {
    this.player = {
      pos: { x: 0, z: 0 },
      facing: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      gold: 0,
      kills: 0,
      weapon: itemById('rusty_sword'),
      armor: null,
      inventory: [{ def: POTION, amount: 1 }],
      attackCd: 0,
      swingT: 0,
      invuln: 0,
      moving: false,
    };
  }

  private newRun(): void {
    this.seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.rng = mulberry32(this.seed);
    this.resetPlayer();
    this.heroDeadT = 0;
    this.hero.group.rotation.set(0, 0, 0);
    this.hud.clearLog();
    this.floating.clear();
    this.hud.hideOverlay();
    this.loadFloor(1);
    this.state = 'playing';
    this.hud.log(`Seed ${this.seed.toString(16)}`, 'muted');
  }

  private clearEntities(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      if (e.telegraph) this.scene.remove(e.telegraph);
    }
    for (const p of this.pickups) this.scene.remove(p.group);
    for (const c of this.chests) this.scene.remove(c.group);
    this.enemies = [];
    this.pickups = [];
    this.chests = [];
    this.hud.bossBar(null);
  }

  private loadFloor(n: number): void {
    this.floor = n;
    this.clearEntities();
    this.world?.dispose();
    this.dungeon = generateDungeon(this.rng, n);
    this.world = buildWorld(this.scene, this.dungeon, this.rng);
    this.explored = new Uint8Array(this.dungeon.width * this.dungeon.height);
    this.portalActive = false;

    const { start } = this.dungeon;
    this.player.pos = { x: toWorld(start.x), z: toWorld(start.y) };
    this.player.invuln = 1.0;
    this.spawnChests();
    this.spawnEnemies();
    this.lastPlayerTile = -1;
    this.updateFlowField(0);

    this.camTarget.set(this.player.pos.x, 0.5, this.player.pos.z);
    this.camera.position.set(this.player.pos.x, 15, this.player.pos.z + 10.5);
    const theme = THEMES[n];
    this.hud.setFloor(n, theme.name);
    this.hud.banner(`Floor ${n}`, theme.name);
    this.hud.log(n === FLOOR_COUNT ? 'Something huge stirs in the dark.' : 'Find the stairs down.', 'muted');
  }

  private spawnAvoid(): (i: number) => boolean {
    const g = this.world!.grid;
    const d = this.dungeon;
    const fromStart = bfs(g.solid, g.width, g.height, d.start.x, d.start.y);
    const stairsIdx = d.stairs.y * d.width + d.stairs.x;
    return (i) => (fromStart[i] >= 0 && fromStart[i] < 7) || i === stairsIdx;
  }

  private spawnChests(): void {
    const d = this.dungeon;
    const g = this.world!.grid;
    const avoid = this.spawnAvoid();
    const rooms = d.rooms.slice(1);
    const count = this.floor === 1 ? 2 : 3;
    for (let k = 0; k < count && rooms.length; k++) {
      const room = rooms.splice(Math.floor(this.rng() * rooms.length), 1)[0];
      const tile = randomSpawnTile(this.rng, room, g, avoid);
      if (!tile) continue;
      g.solid[tile.y * g.width + tile.x] = WALL;
      const chest = makeChest();
      chest.group.position.set(toWorld(tile.x), 0, toWorld(tile.y));
      chest.group.rotation.y = Math.floor(this.rng() * 4) * (Math.PI / 2);
      this.scene.add(chest.group);
      this.chests.push({ pos: { x: toWorld(tile.x), z: toWorld(tile.y) }, tile, group: chest.group, lid: chest.lid, opened: false, openT: 0 });
    }
  }

  private spawnEnemies(): void {
    const d = this.dungeon;
    const g = this.world!.grid;
    const avoid = this.spawnAvoid();
    const stairsRoom = d.rooms.find((r) => r.cx === d.stairs.x && r.cy === d.stairs.y) ?? d.rooms[d.rooms.length - 1];
    const rooms = d.rooms.filter((r) => r !== d.rooms[0] && (this.floor < FLOOR_COUNT || r !== stairsRoom));
    for (const entry of floorSpawnTable(this.floor)) {
      const n = randInt(this.rng, entry.min, entry.max);
      for (let i = 0; i < n; i++) {
        const tile = randomSpawnTile(this.rng, pick(this.rng, rooms), g, avoid);
        if (tile) this.spawnEnemy(ENEMIES[entry.id], { x: toWorld(tile.x), z: toWorld(tile.y) });
      }
    }
    if (this.floor === FLOOR_COUNT) {
      const tile = randomSpawnTile(this.rng, stairsRoom, g, avoid) ?? { x: d.stairs.x + 1, y: d.stairs.y };
      this.spawnEnemy(ENEMIES.boss, { x: toWorld(tile.x), z: toWorld(tile.y) });
    }
  }

  private spawnEnemy(def: EnemyDef, pos: Vec2): void {
    const { group, parts } = makeEnemy(def);
    group.position.set(pos.x, 0, pos.z);
    this.scene.add(group);
    this.enemies.push({
      def, hp: def.hp, pos: { ...pos }, facing: this.rng() * Math.PI * 2, group, parts,
      state: 'idle', timer: 0, attackCd: 0.5, flash: 0, kb: { x: 0, z: 0 }, phase: this.rng() * 10,
      slamCd: 3, telegraph: null,
    });
  }

  /* --------------------------------- loop ---------------------------------- */

  private loop = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.time += dt;
    if (this.input.wasPressed('KeyM')) this.hud.log(sfx.toggleMute() ? 'Muted' : 'Sound on', 'muted');
    switch (this.state) {
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'dead':
      case 'victory':
        if (this.input.wasPressed('KeyR')) this.newRun();
        else {
          this.heroDeadT += dt;
          this.animateHero(dt);
          this.updateAmbient(dt);
        }
        break;
      case 'transition':
      case 'title':
        if (this.world) {
          this.animateHero(dt);
          this.updateAmbient(dt);
        }
        break;
    }
  }

  private updatePlaying(dt: number): void {
    const p = this.player;
    const grid = this.world!.grid;

    const ax = this.input.axis();
    p.moving = ax.x !== 0 || ax.z !== 0;
    if (p.moving) slideMove(grid, p.pos, ax.x * PLAYER_SPEED * dt, ax.z * PLAYER_SPEED * dt, PLAYER_RADIUS);

    this.raycaster.setFromCamera(this.input.mouse, this.camera);
    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint)) {
      const dx = this.aimPoint.x - p.pos.x;
      const dz = this.aimPoint.z - p.pos.z;
      if (dx * dx + dz * dz > 0.04) p.facing = Math.atan2(dx, dz);
    } else if (p.moving) p.facing = Math.atan2(ax.x, ax.z);

    p.attackCd -= dt;
    p.invuln -= dt;
    p.swingT -= dt;
    if ((this.input.mouseDown || this.input.isDown('Space')) && p.attackCd <= 0) this.playerAttack();
    for (let i = 0; i < INVENTORY_CAP; i++) if (this.input.wasPressed(`Digit${i + 1}`)) this.useSlot(i);

    this.updateFlowField(dt);
    for (const e of [...this.enemies]) this.updateEnemy(e, dt);
    this.separateEnemies();
    this.updatePickups(dt);
    this.updateChests(dt);
    if (this.state === 'playing') this.checkExits();

    this.animateHero(dt);
    this.updateAmbient(dt);
    this.updateHud(dt);
  }

  /* -------------------------------- combat --------------------------------- */

  private playerAttack(): void {
    const p = this.player;
    p.attackCd = PLAYER_ATTACK_COOLDOWN;
    p.swingT = SWING_DURATION;
    sfx.swing();
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    for (const e of [...this.enemies]) {
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > PLAYER_ATTACK_RANGE + e.def.radius) continue;
      const cos = (dx * fx + dz * fz) / Math.max(dist, 1e-4);
      if (dist > 0.7 && Math.acos(Math.min(1, Math.max(-1, cos))) > PLAYER_ATTACK_ARC) continue;
      const roll = rollDamage(this.rng, p.weapon.damage ?? 5);
      this.hitEnemy(e, roll.damage, roll.crit, fx, fz);
    }
  }

  private hitEnemy(e: Enemy, dmg: number, crit: boolean, kx: number, kz: number): void {
    e.hp -= dmg;
    e.flash = 0.12;
    const kb = e.def.id === 'boss' ? 1.5 : 7;
    e.kb.x += kx * kb;
    e.kb.z += kz * kb;
    const top = e.def.id === 'boss' ? 3.4 : e.def.id === 'bat' ? 1.7 : 1.5;
    this.floating.spawn({ x: e.pos.x, y: top, z: e.pos.z }, String(dmg), crit ? '#ffc233' : '#ffffff', crit);
    this.particles.burst(e.pos.x, 0.8, e.pos.z, e.def.color, crit ? 18 : 8, 4, 0.5, 0.12);
    sfx.hit(crit);
    if (e.state === 'idle') this.aggro(e);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private aggro(e: Enemy): void {
    e.state = 'chase';
    if (e.def.id === 'boss') {
      sfx.roar();
      this.hud.log('The Bone King awakens!', 'warn');
      this.camShake = Math.max(this.camShake, 0.5);
    }
  }

  private killEnemy(e: Enemy): void {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.scene.remove(e.group);
    if (e.telegraph) this.scene.remove(e.telegraph);
    this.particles.burst(e.pos.x, 0.6, e.pos.z, e.def.color, e.def.id === 'boss' ? 60 : 24, 5, 0.8, 0.18);
    this.player.kills++;
    this.spawnDrops(rollLoot(this.rng, e.def.id, this.floor), e.pos);
    if (e.def.id === 'boss') {
      sfx.bossDie();
      this.hud.bossBar(null);
      this.activatePortal();
      this.hud.banner('The Bone King falls', 'the portal awakens');
      this.hud.log('The portal hums with purple light.', 'warn');
      this.camShake = 0.9;
    } else sfx.enemyDie();
  }

  private damagePlayer(raw: number): void {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'playing') return;
    const dmg = applyDefense(raw, p.armor?.defense ?? 0);
    p.hp -= dmg;
    p.invuln = 0.45;
    this.hud.hurtFlash();
    this.floating.spawn({ x: p.pos.x, y: 1.9, z: p.pos.z }, `-${dmg}`, '#ff5a5f');
    this.particles.burst(p.pos.x, 1, p.pos.z, 0xe5484d, 8, 3, 0.4, 0.1);
    sfx.hurt();
    this.camShake = Math.max(this.camShake, 0.3);
    if (p.hp <= 0) {
      p.hp = 0;
      this.die();
    }
  }

  private die(): void {
    this.state = 'dead';
    this.hud.setHp(0, this.player.maxHp);
    this.hud.log('You died.', 'warn');
    sfx.roar();
    window.setTimeout(() => {
      if (this.state !== 'dead') return;
      const p = this.player;
      this.hud.showOverlay(`
        <h1 class="dead">You Died</h1>
        <p>Floor ${this.floor} · ${THEMES[this.floor].name}</p>
        <p><span class="gold">${p.gold} gold</span> · ${p.kills} kills · ${p.weapon.name}</p>
        <div class="cta">Click or press R to try again</div>`);
    }, 1100);
  }

  private victory(): void {
    this.state = 'victory';
    sfx.victory();
    this.hud.fade(1);
    window.setTimeout(() => {
      if (this.state !== 'victory') return;
      const p = this.player;
      this.hud.fade(0);
      this.hud.showOverlay(`
        <h1 class="win">You Escaped</h1>
        <p>The Bone Throne is silent. Both floors cleared.</p>
        <p><span class="gold">${p.gold} gold</span> · ${p.kills} kills · <span class="r-${p.weapon.rarity}">${p.weapon.name}</span>${
          p.armor ? ` · <span class="r-${p.armor.rarity}">${p.armor.name}</span>` : ''
        }</p>
        <p class="muted">Seed ${this.seed.toString(16)}</p>
        <div class="cta">Click or press R to play again</div>`);
    }, 900);
  }

  /* -------------------------------- enemies -------------------------------- */

  private updateFlowField(dt: number): void {
    const g = this.world!.grid;
    const p = this.player;
    this.flowTimer -= dt;
    const tile = toTile(p.pos.z) * g.width + toTile(p.pos.x);
    if (tile !== this.lastPlayerTile || this.flowTimer <= 0 || this.flowField.length === 0) {
      this.flowField = bfs(g.solid, g.width, g.height, toTile(p.pos.x), toTile(p.pos.z));
      this.lastPlayerTile = tile;
      this.flowTimer = 0.25;
    }
  }

  private hasLineOfSight(a: Vec2, b: Vec2): boolean {
    const g = this.world!.grid;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / 0.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!passableAt(g, lerp(a.x, b.x, t), lerp(a.z, b.z, t))) return false;
    }
    return true;
  }

  private updateEnemy(e: Enemy, dt: number): void {
    const p = this.player;
    const grid = this.world!.grid;
    const dx = p.pos.x - e.pos.x;
    const dz = p.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.attackCd -= dt;
    e.flash -= dt;
    e.phase += dt;

    if (Math.abs(e.kb.x) + Math.abs(e.kb.z) > 0.01) {
      slideMove(grid, e.pos, e.kb.x * dt, e.kb.z * dt, e.def.radius);
      const decay = Math.exp(-9 * dt);
      e.kb.x *= decay;
      e.kb.z *= decay;
    }

    switch (e.state) {
      case 'idle':
        if (dist < e.def.aggroRange && this.hasLineOfSight(e.pos, p.pos)) this.aggro(e);
        break;
      case 'chase': {
        if (dist <= e.def.attackRange && e.attackCd <= 0) {
          e.state = 'windup';
          e.timer = e.def.id === 'boss' ? 0.5 : 0.35;
          e.facing = Math.atan2(dx, dz);
          break;
        }
        if (e.def.id === 'boss') {
          e.slamCd -= dt;
          if (e.slamCd <= 0 && dist < 5.5) {
            e.state = 'slam';
            e.timer = 0.9;
            this.showTelegraph(e);
            break;
          }
        }
        const dir = flowStep(grid, this.flowField, e.pos, p.pos);
        if (dir) {
          if (dist > e.def.attackRange * 0.8) slideMove(grid, e.pos, dir.x * e.def.speed * dt, dir.z * e.def.speed * dt, e.def.radius);
          e.facing = Math.atan2(dir.x, dir.z);
        }
        break;
      }
      case 'windup':
        e.timer -= dt;
        e.facing = Math.atan2(dx, dz);
        if (e.timer <= 0) {
          if (dist <= e.def.attackRange + 0.5) this.damagePlayer(e.def.damage);
          e.attackCd = e.def.attackCooldown;
          e.state = 'chase';
        }
        break;
      case 'slam':
        e.timer -= dt;
        if (e.telegraph) {
          const t = 1 - e.timer / 0.9;
          e.telegraph.scale.setScalar(0.2 + 0.8 * t);
          (e.telegraph.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.4 * t;
        }
        if (e.timer <= 0) {
          if (e.telegraph) {
            this.scene.remove(e.telegraph);
            e.telegraph = null;
          }
          if (dist < BOSS_SLAM_RADIUS) this.damagePlayer(BOSS_SLAM_DAMAGE);
          this.camShake = Math.max(this.camShake, 0.6);
          this.particles.burst(e.pos.x, 0.2, e.pos.z, 0xc9b8a0, 40, 7, 0.7, 0.16);
          sfx.slam();
          e.slamCd = BOSS_SLAM_CD;
          e.attackCd = 0.8;
          e.state = 'chase';
        }
        break;
    }

    this.animateEnemy(e);
    e.group.position.set(e.pos.x, 0, e.pos.z);
    e.group.rotation.y = e.facing;
    const tint = e.flash > 0 ? 0xffffff : e.state === 'windup' || e.state === 'slam' ? 0xff3030 : 0x000000;
    const intensity = e.flash > 0 ? 1 : e.state === 'windup' || e.state === 'slam' ? 0.55 : 0;
    for (const m of e.parts.mats) {
      m.emissive.setHex(tint);
      m.emissiveIntensity = intensity;
    }
  }

  private showTelegraph(e: Enemy): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, BOSS_SLAM_RADIUS, 32),
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(e.pos.x, 0.05, e.pos.z);
    ring.scale.setScalar(0.2);
    this.scene.add(ring);
    e.telegraph = ring;
    this.hud.log('The Bone King raises his cleaver!', 'warn');
  }

  private animateEnemy(e: Enemy): void {
    const P = e.parts;
    const chasing = e.state === 'chase';
    const t = e.phase;
    switch (e.def.id) {
      case 'slime': {
        if (!P.body) break;
        const bounce = chasing ? Math.abs(Math.sin(t * 7)) : Math.abs(Math.sin(t * 2)) * 0.3;
        P.body.position.y = 0.42 + bounce * 0.35;
        P.body.scale.set(1 + (1 - bounce) * 0.12, 0.78 - (1 - bounce) * 0.1 + bounce * 0.15, 1 + (1 - bounce) * 0.12);
        if (e.state === 'windup') P.body.scale.multiplyScalar(1.2);
        break;
      }
      case 'bat': {
        if (P.wingL && P.wingR) {
          const flap = Math.sin(t * 18) * 0.75;
          P.wingL.rotation.z = flap;
          P.wingR.rotation.z = -flap;
        }
        if (P.body) P.body.position.y = 1.1 + Math.sin(t * 3) * 0.15;
        break;
      }
      case 'skeleton':
      case 'boss': {
        const walk = chasing ? Math.sin(t * 9) : 0;
        if (P.legL) P.legL.rotation.x = walk * 0.7;
        if (P.legR) P.legR.rotation.x = -walk * 0.7;
        if (P.armR) {
          const target = e.state === 'windup' ? -2.4 : e.state === 'slam' ? -2.8 : -0.7 + walk * 0.3;
          P.armR.rotation.x = lerp(P.armR.rotation.x, target, 0.25);
        }
        if (P.body) P.body.rotation.x = e.state === 'slam' ? -0.25 : 0;
        break;
      }
    }
  }

  private separateEnemies(): void {
    const p = this.player;
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.def.radius + b.def.radius;
        if (d < min && d > 1e-4) {
          const push = ((min - d) / 2) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          slideMove(this.world!.grid, a.pos, -nx * push, -nz * push, a.def.radius);
          slideMove(this.world!.grid, b.pos, nx * push, nz * push, b.def.radius);
        }
      }
      const dx = a.pos.x - p.pos.x;
      const dz = a.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const min = a.def.radius + PLAYER_RADIUS;
      if (d < min && d > 1e-4) {
        const push = (min - d) * 0.6;
        slideMove(this.world!.grid, a.pos, (dx / d) * push, (dz / d) * push, a.def.radius);
      }
    }
  }

  /* ---------------------------------- loot --------------------------------- */

  private spawnDrops(drops: ItemDrop[], origin: Vec2): void {
    const g = this.world!.grid;
    const p = this.player;
    for (const drop of drops) {
      const a = this.rng() * Math.PI * 2;
      const r = 0.5 + this.rng() * 0.7;
      const cands: Vec2[] = [{ x: origin.x + Math.cos(a) * r, z: origin.z + Math.sin(a) * r }, origin, { ...p.pos }];
      const pos = cands.find((c) => circleFree(g, c.x, c.z, 0.2)) ?? { ...p.pos };
      const group = makePickup(drop);
      group.position.set(pos.x, 0, pos.z);
      this.scene.add(group);
      this.pickups.push({ drop, pos, group, phase: this.rng() * 6, blockedT: 0.25 });
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (const pk of [...this.pickups]) {
      pk.phase += dt;
      pk.blockedT -= dt;
      pk.group.position.y = Math.sin(pk.phase * 3) * 0.08;
      const spin = pk.group.getObjectByName('spin');
      if (spin) spin.rotation.y += dt * 1.6;
      if (pk.blockedT > 0) continue;
      const d = Math.hypot(pk.pos.x - p.pos.x, pk.pos.z - p.pos.z);
      if (d > 1.0) continue;
      if (this.collect(pk.drop)) {
        this.scene.remove(pk.group);
        this.pickups.splice(this.pickups.indexOf(pk), 1);
      } else pk.blockedT = 0.8;
    }
  }

  private collect(drop: ItemDrop): boolean {
    const p = this.player;
    const def = drop.def;
    const at = { x: p.pos.x, y: 1.8, z: p.pos.z };
    if (def.kind === 'gold') {
      p.gold += drop.amount;
      this.hud.log(`+${drop.amount} gold`, 'gold');
      this.floating.spawn(at, `+${drop.amount}g`, '#ffc233');
      sfx.coin();
      return true;
    }
    if (def.kind === 'potion') {
      const stack = p.inventory.find((i) => i.def === POTION);
      if (stack) stack.amount += drop.amount;
      else if (p.inventory.length < INVENTORY_CAP) p.inventory.push({ def: POTION, amount: drop.amount });
      else {
        this.hud.log('Pack is full', 'muted');
        return false;
      }
      this.hud.log(`Health potion ×${drop.amount}`, 'heal');
      sfx.gear();
      return true;
    }
    const current = def.kind === 'weapon' ? p.weapon : p.armor;
    if (isUpgrade(current, def)) {
      this.equip(def, true);
      return true;
    }
    if (p.inventory.length < INVENTORY_CAP) {
      p.inventory.push({ def, amount: 1 });
      this.hud.log(`${def.name} → pack`, `r-${def.rarity}`);
      sfx.gear();
      return true;
    }
    this.hud.log('Pack is full', 'muted');
    return false;
  }

  private equip(def: ItemDef, fromPickup: boolean): void {
    const p = this.player;
    const isWeapon = def.kind === 'weapon';
    const old = isWeapon ? p.weapon : p.armor;
    if (isWeapon) p.weapon = def;
    else p.armor = def;
    if (old && fromPickup) {
      if (p.inventory.length < INVENTORY_CAP) p.inventory.push({ def: old, amount: 1 });
      else this.hud.log(`Dropped ${old.name}`, 'muted');
    }
    const stat = isWeapon ? `${def.damage} dmg` : `${def.defense} def`;
    this.hud.log(`Equipped ${def.name} (${stat})`, `r-${def.rarity}`);
    this.floating.spawn({ x: p.pos.x, y: 2.1, z: p.pos.z }, def.name, rarityCss(def));
    sfx.gear();
  }

  private useSlot(i: number): void {
    if (this.state !== 'playing') return;
    const p = this.player;
    const it = p.inventory[i];
    if (!it) return;
    if (it.def.kind === 'potion') {
      if (p.hp >= p.maxHp) {
        this.hud.log('Already at full health', 'muted');
        return;
      }
      const heal = it.def.heal ?? 0;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      it.amount--;
      if (it.amount <= 0) p.inventory.splice(i, 1);
      this.floating.spawn({ x: p.pos.x, y: 1.9, z: p.pos.z }, `+${heal}`, '#5ee06a');
      this.particles.burst(p.pos.x, 1, p.pos.z, 0x5ee06a, 10, 2.5, 0.5, 0.1);
      this.hud.log(`Drank a potion (+${heal})`, 'heal');
      sfx.potion();
      return;
    }
    const isWeapon = it.def.kind === 'weapon';
    const old = isWeapon ? p.weapon : p.armor;
    if (isWeapon) p.weapon = it.def;
    else p.armor = it.def;
    if (old) p.inventory[i] = { def: old, amount: 1 };
    else p.inventory.splice(i, 1);
    this.hud.log(`Equipped ${it.def.name}`, `r-${it.def.rarity}`);
    sfx.gear();
  }

  private updateChests(dt: number): void {
    const p = this.player;
    for (const c of this.chests) {
      if (c.opened) {
        c.openT += dt;
        c.lid.rotation.x = -Math.min(1, c.openT * 3) * 1.9;
        continue;
      }
      const dx = p.pos.x - c.pos.x;
      const dz = p.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.75) continue;
      c.opened = true;
      const toward = { x: c.pos.x + (dx / d) * 1.4, z: c.pos.z + (dz / d) * 1.4 };
      this.spawnDrops(rollLoot(this.rng, 'chest', this.floor), toward);
      this.particles.burst(c.pos.x, 0.7, c.pos.z, 0xffc233, 16, 3, 0.7, 0.12);
      this.hud.log('Opened a chest', 'gold');
      sfx.chest();
    }
  }

  /* ------------------------------ floors & exits ---------------------------- */

  private checkExits(): void {
    const p = this.player;
    const s = this.dungeon.stairs;
    const d = Math.hypot(p.pos.x - toWorld(s.x), p.pos.z - toWorld(s.y));
    if (this.floor < FLOOR_COUNT) {
      if (d < 1.0) this.descend();
    } else if (this.portalActive && d < 1.1) this.victory();
  }

  private descend(): void {
    this.state = 'transition';
    sfx.stairs();
    this.hud.fade(1);
    this.hud.log('You descend…', 'muted');
    window.setTimeout(() => {
      this.loadFloor(this.floor + 1);
      this.hud.fade(0);
      window.setTimeout(() => {
        if (this.state === 'transition') this.state = 'playing';
      }, 350);
    }, 600);
  }

  private activatePortal(): void {
    const portal = this.world?.portal;
    if (!portal) return;
    this.portalActive = true;
    (portal.ring.material as THREE.MeshStandardMaterial).emissive.setHex(0x9b5cff);
    (portal.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
    (portal.disc.material as THREE.MeshBasicMaterial).opacity = 0.75;
    portal.light.intensity = 16;
  }

  /* -------------------------------- visuals -------------------------------- */

  private animateHero(dt: number): void {
    const h = this.hero;
    const p = this.player;
    h.group.position.set(p.pos.x, 0, p.pos.z);
    if (this.state === 'dead') {
      h.group.rotation.x = lerp(h.group.rotation.x, -Math.PI / 2, Math.min(1, dt * 6));
      h.group.position.y = lerp(0, 0.35, Math.min(1, this.heroDeadT * 3));
      return;
    }
    h.group.rotation.y = p.facing;
    const walk = p.moving && this.state === 'playing' ? Math.sin(this.time * 13) : 0;
    h.legL.rotation.x = walk * 0.65;
    h.legR.rotation.x = -walk * 0.65;
    h.armL.rotation.x = -walk * 0.5;
    h.body.position.y = 0.8 + Math.abs(walk) * 0.035;
    if (p.swingT > 0) {
      const t = 1 - p.swingT / SWING_DURATION;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      h.armR.rotation.x = -Math.PI / 2 + 0.15;
      h.armR.rotation.y = 1.3 - 2.6 * ease;
    } else {
      h.armR.rotation.x = lerp(h.armR.rotation.x, -0.9 + walk * 0.4, 0.25);
      h.armR.rotation.y = lerp(h.armR.rotation.y, 0, 0.25);
    }
    const hurt = p.invuln > 0 && p.hp < p.maxHp;
    h.tunic.emissive.setHex(hurt ? 0xff2020 : 0x000000);
    h.tunic.emissiveIntensity = hurt ? 0.7 : 0;
  }

  private updateAmbient(dt: number): void {
    const p = this.player;
    this.heroLight.position.set(p.pos.x, 2.4, p.pos.z);
    const w = this.world;
    if (w) {
      for (const t of w.torches) {
        const n = Math.sin(this.time * 17 + t.phase) * 0.5 + Math.sin(this.time * 31 + t.phase * 2) * 0.5;
        t.flame.scale.set(1 + n * 0.12, 1 + n * 0.25, 1 + n * 0.12);
        if (t.light) t.light.intensity = t.base * (0.85 + n * 0.2);
      }
      if (w.portal) {
        w.portal.ring.rotation.y += dt * (this.portalActive ? 1.6 : 0.2);
        w.portal.disc.rotation.z -= dt * 0.8;
        if (this.portalActive) w.portal.light.intensity = 14 + Math.sin(this.time * 6) * 4;
      }
      if (w.stairs) {
        const glow = w.stairs.getObjectByName('glow');
        if (glow) glow.scale.setScalar(1 + Math.sin(this.time * 3) * 0.06);
      }
    }
    this.particles.update(dt);
    this.floating.update(dt);

    this.camShake = Math.max(0, this.camShake - dt * 1.4);
    const k = 1 - Math.exp(-7 * dt);
    this.camTarget.lerp(new THREE.Vector3(p.pos.x, 0.5, p.pos.z), k);
    this.camera.position.lerp(new THREE.Vector3(p.pos.x, 15, p.pos.z + 10.5), k);
    const sx = (Math.random() - 0.5) * this.camShake * 0.6;
    const sz = (Math.random() - 0.5) * this.camShake * 0.6;
    this.camera.lookAt(this.camTarget.x + sx, this.camTarget.y, this.camTarget.z - 1.5 + sz);
  }

  private updateHud(dt: number): void {
    const p = this.player;
    this.hud.setHp(p.hp, p.maxHp);
    this.hud.setGold(p.gold);
    this.hud.setKills(p.kills);
    this.hud.setEquipment(p.weapon, p.armor);
    this.hud.setInventory(p.inventory);
    const boss = this.enemies.find((e) => e.def.id === 'boss');
    if (boss && boss.state !== 'idle') this.hud.bossBar(boss.def.name, boss.hp, boss.def.hp);
    else this.hud.bossBar(null);

    this.mapTimer -= dt;
    if (this.mapTimer > 0) return;
    this.mapTimer = 0.12;
    const d = this.dungeon;
    const px = toTile(p.pos.x);
    const py = toTile(p.pos.z);
    for (let y = py - REVEAL_RADIUS; y <= py + REVEAL_RADIUS; y++) {
      for (let x = px - REVEAL_RADIUS; x <= px + REVEAL_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= d.width || y >= d.height) continue;
        if ((x - px) ** 2 + (y - py) ** 2 <= REVEAL_RADIUS ** 2) this.explored[y * d.width + x] = 1;
      }
    }
    this.hud.drawMinimap(
      d,
      this.world!.grid.solid,
      this.explored,
      { x: px, y: py },
      this.enemies.map((e) => ({ x: toTile(e.pos.x), y: toTile(e.pos.z) })),
      this.chests.filter((c) => !c.opened).map((c) => c.tile),
      this.floor < FLOOR_COUNT ? 'stairs' : this.portalActive ? 'portal-on' : 'portal-off',
    );
  }
}
