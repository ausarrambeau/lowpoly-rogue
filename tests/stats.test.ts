import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDamage, applyDefense, isUpgrade, floorSpawnTable, ENEMIES } from '../src/stats';
import { itemById } from '../src/items';
import { mulberry32 } from '../src/rng';

test('rollDamage stays within ±20% (or exactly double on crit) and never below 1', () => {
  const rng = mulberry32(9);
  let crits = 0;
  for (let i = 0; i < 5000; i++) {
    const r = rollDamage(rng, 20);
    if (r.crit) {
      crits++;
      assert.ok(r.damage >= 32 && r.damage <= 48, `crit ${r.damage}`);
    } else {
      assert.ok(r.damage >= 16 && r.damage <= 24, `hit ${r.damage}`);
    }
  }
  assert.ok(crits / 5000 > 0.07 && crits / 5000 < 0.13, `crit rate ${crits / 5000}`);
  assert.equal(rollDamage(() => 0, 0).damage, 1);
  assert.equal(rollDamage(() => 0.5, 1).damage, 1);
});

test('applyDefense floors at 1', () => {
  assert.equal(applyDefense(10, 3), 7);
  assert.equal(applyDefense(5, 50), 1);
  assert.equal(applyDefense(5, 0), 5);
});

test('isUpgrade compares within kind and treats nothing-equipped as 0', () => {
  assert.ok(isUpgrade(null, itemById('rusty_sword')));
  assert.ok(isUpgrade(itemById('rusty_sword'), itemById('iron_sword')));
  assert.ok(!isUpgrade(itemById('iron_sword'), itemById('rusty_sword')));
  assert.ok(isUpgrade(null, itemById('leather_vest')));
  assert.ok(!isUpgrade(itemById('plate_armor'), itemById('leather_vest')));
  assert.ok(!isUpgrade(null, itemById('potion')));
});

test('spawn tables: floor 1 has no bats, floor 2 has bats; boss is never in the table', () => {
  const f1 = floorSpawnTable(1);
  const f2 = floorSpawnTable(2);
  assert.ok(!f1.some((e) => e.id === 'bat'));
  assert.ok(f2.some((e) => e.id === 'bat'));
  assert.ok(!f1.some((e) => e.id === 'boss') && !f2.some((e) => e.id === 'boss'));
  for (const e of [...f1, ...f2]) assert.ok(e.min <= e.max && e.min > 0 && ENEMIES[e.id]);
});
