import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slideMove, circleFree, flowStep, toWorld, toTile, TILE, type Grid } from '../src/physics';
import { bfs, FLOOR, WALL } from '../src/grid';

/** 7x7 grid with a floor cross: row 3 and column 3 are open. */
function cross(): Grid {
  const width = 7;
  const height = 7;
  const solid = new Uint8Array(width * height).fill(WALL);
  for (let i = 0; i < 7; i++) {
    solid[3 * width + i] = FLOOR;
    solid[i * width + 3] = FLOOR;
  }
  return { solid, width, height };
}

test('toTile/toWorld round-trip and tile boundaries sit halfway between centers', () => {
  assert.equal(toTile(toWorld(5)), 5);
  assert.equal(toTile(TILE * 2 + TILE * 0.49), 2);
  assert.equal(toTile(TILE * 2 + TILE * 0.51), 3);
});

test('slideMove stops at a wall on one axis but keeps sliding on the other', () => {
  const g = cross();
  const pos = { x: toWorld(3), z: toWorld(3) };
  // push +x along the open row: fine
  slideMove(g, pos, 1, 0, 0.3);
  assert.equal(pos.x, toWorld(3) + 1);
  // now try moving diagonally into the wall above the row: x proceeds, z is blocked
  const r = slideMove(g, pos, 0.5, -1, 0.3);
  assert.equal(r.blockedZ, true);
  assert.equal(r.blockedX, false);
  assert.equal(pos.z, toWorld(3));
});

test('circleFree respects the radius (a fat circle cannot squeeze past a corner)', () => {
  const g = cross();
  assert.ok(circleFree(g, toWorld(3), toWorld(3), 0.9));
  // nudged diagonally off the crossing, a fat circle overlaps the corner wall tile; a thin one does not
  assert.ok(!circleFree(g, toWorld(3) + 0.9, toWorld(3) + 0.9, 0.9));
  assert.ok(circleFree(g, toWorld(3) + 0.9, toWorld(3) + 0.9, 0.05));
});

test('flowStep walks the BFS gradient and goes straight when adjacent', () => {
  const g = cross();
  const target = { x: toWorld(6), z: toWorld(3) };
  const field = bfs(g.solid, g.width, g.height, 6, 3);
  // enemy at the top of the column must first descend to the crossing, i.e. move +z
  const step = flowStep(g, field, { x: toWorld(3), z: toWorld(0) }, target)!;
  assert.ok(step.z > 0.9 && Math.abs(step.x) < 0.1, JSON.stringify(step));
  // adjacent to the target: straight line
  const near = flowStep(g, field, { x: toWorld(5), z: toWorld(3) }, target)!;
  assert.ok(near.x > 0.99);
  // standing on a wall: no path
  assert.equal(flowStep(g, field, { x: toWorld(0), z: toWorld(0) }, target), null);
});
