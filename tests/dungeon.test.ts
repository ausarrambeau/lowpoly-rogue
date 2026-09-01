import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, bfsDistances, idx, isFloor, FLOOR } from '../src/dungeon';
import { mulberry32 } from '../src/rng';

test('every seed yields a connected dungeon with reachable stairs and all rooms reachable', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const d = generateDungeon(mulberry32(seed), 1);
    assert.ok(d.rooms.length >= 7, `seed ${seed}: only ${d.rooms.length} rooms`);
    assert.ok(isFloor(d, d.start.x, d.start.y), `seed ${seed}: start not floor`);
    assert.ok(isFloor(d, d.stairs.x, d.stairs.y), `seed ${seed}: stairs not floor`);
    const dist = bfsDistances(d, d.start);
    assert.ok(dist[idx(d, d.stairs.x, d.stairs.y)] > 8, `seed ${seed}: stairs too close/unreachable`);
    for (const r of d.rooms) assert.ok(dist[idx(d, r.cx, r.cy)] >= 0, `seed ${seed}: room unreachable`);
    assert.notDeepEqual(d.start, d.stairs);
  }
});

test('is deterministic for a given seed', () => {
  const a = generateDungeon(mulberry32(42), 2);
  const b = generateDungeon(mulberry32(42), 2);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.deepEqual(a.rooms, b.rooms);
  assert.equal(a.floor, 2);
});

test('outer border is always wall (nothing can walk off the grid)', () => {
  const d = generateDungeon(mulberry32(7), 1);
  for (let x = 0; x < d.width; x++) {
    assert.notEqual(d.tiles[idx(d, x, 0)], FLOOR);
    assert.notEqual(d.tiles[idx(d, x, d.height - 1)], FLOOR);
  }
  for (let y = 0; y < d.height; y++) {
    assert.notEqual(d.tiles[idx(d, 0, y)], FLOOR);
    assert.notEqual(d.tiles[idx(d, d.width - 1, y)], FLOOR);
  }
});

test('bfsDistances from a wall tile is all -1', () => {
  const d = generateDungeon(mulberry32(3), 1);
  const dist = bfsDistances(d, { x: 0, y: 0 });
  assert.ok(dist.every((v) => v === -1));
});
