# Low Poly Rogue

A browser roguelike dungeon crawler: two procedurally generated floors, real-time melee combat,
loot with rarity tiers, a boss on the last floor, permadeath. No assets — every mesh is built from
primitives with flat shading, every sound is synthesized.

**Stack:** Vite · TypeScript · Three.js. No engine, no physics library.

```bash
npm install
npm run dev        # http://localhost:4620
npm test           # pure-logic unit tests (dungeon, loot, combat math, collision)
npm run build      # typecheck + production bundle in dist/
npm run build:single   # one self-contained HTML in dist-single/ (+ artifact.html fragment)
```

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | move |
| mouse | aim |
| click / space | attack (hold to keep swinging) |
| 1–6 | drink potion / equip the item in that inventory slot |
| M | mute |
| R | restart after death |

## How it fits together

- `src/dungeon.ts` — rooms-and-corridors generator on a tile grid (pure, seeded).
- `src/items.ts` — item catalogue and loot tables per enemy / chest / boss.
- `src/stats.ts` — enemy definitions, spawn tables, damage math.
- `src/physics.ts` — world↔tile mapping, circle-vs-grid sliding collision, flow-field steering.
- `src/world.ts` — turns a dungeon into instanced floors/walls, torches, props, lights, fog.
- `src/meshes.ts` — low-poly factories: hero, slime, skeleton, bat, Bone King, pickups, chest, portal.
- `src/game.ts` — state machine, spawning, combat, loot, floors, camera, HUD updates.
- `src/hud.ts`, `src/fx.ts`, `src/audio.ts`, `src/input.ts` — overlay UI, particles + damage numbers, synth SFX, input.

Add `?debug` to the URL to get `window.__rogue` (status, teleport, manual `step()`), used for scripted playthroughs.

## Loot

Enemies roll gold / potions / gear on death; chests always hold gold plus one piece of gear with a
rarity bump; the Bone King always drops his Cleaver and the Dragon Scale. Picking up gear that beats
what you wear auto-equips it and moves the old piece into your pack; otherwise it goes to the pack.
Rarity: common · rare · epic · legendary.
