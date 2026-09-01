import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollLoot, WEAPONS, ARMORS, POTION, GOLD, itemById, RARITY_COLOR } from '../src/items';
import { mulberry32 } from '../src/rng';

test('boss always drops the cleaver, dragon scale, potions and gold', () => {
  for (let seed = 0; seed < 20; seed++) {
    const drops = rollLoot(mulberry32(seed), 'boss', 2);
    assert.ok(drops.some((d) => d.def.id === 'bone_cleaver'));
    assert.ok(drops.some((d) => d.def.id === 'dragon_scale'));
    assert.ok(drops.some((d) => d.def === POTION && d.amount === 2));
    assert.equal(drops.filter((d) => d.def === GOLD).length, 3);
    for (const g of drops.filter((d) => d.def === GOLD)) assert.ok(g.amount > 0);
  }
});

test('chests always contain gold and one piece of gear', () => {
  for (let seed = 0; seed < 50; seed++) {
    const drops = rollLoot(mulberry32(seed), 'chest', 1);
    assert.ok(drops.some((d) => d.def === GOLD));
    assert.equal(drops.filter((d) => d.def.kind === 'weapon' || d.def.kind === 'armor').length, 1);
  }
});

test('the cleaver never drops outside the boss', () => {
  for (let seed = 0; seed < 400; seed++) {
    for (const src of ['slime', 'skeleton', 'bat', 'chest'] as const) {
      const drops = rollLoot(mulberry32(seed * 7 + 1), src, 2);
      assert.ok(!drops.some((d) => d.def.id === 'bone_cleaver'), `${src} dropped the cleaver`);
    }
  }
});

test('regular enemies drop gold at a plausible rate and sometimes nothing', () => {
  let gold = 0;
  let nothing = 0;
  const N = 2000;
  for (let seed = 0; seed < N; seed++) {
    const drops = rollLoot(mulberry32(seed), 'slime', 1);
    if (drops.length === 0) nothing++;
    if (drops.some((d) => d.def === GOLD)) gold++;
  }
  assert.ok(gold / N > 0.45 && gold / N < 0.65, `gold rate ${gold / N}`);
  assert.ok(nothing > 0, 'some kills must drop nothing');
});

test('floor 2 gear skews rarer than floor 1', () => {
  const rareOrBetter = (floor: number) => {
    let n = 0;
    let total = 0;
    for (let seed = 0; seed < 1500; seed++) {
      for (const d of rollLoot(mulberry32(seed), 'chest', floor)) {
        if (d.def.kind === 'weapon' || d.def.kind === 'armor') {
          total++;
          if (d.def.rarity !== 'common') n++;
        }
      }
    }
    return n / total;
  };
  assert.ok(rareOrBetter(2) > rareOrBetter(1));
});

test('catalogue integrity: unique ids, monotone rarity → power, colors for every rarity', () => {
  const ids = [...WEAPONS, ...ARMORS].map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.throws(() => itemById('nope'));
  const order = ['common', 'rare', 'epic', 'legendary'];
  for (const list of [WEAPONS, ARMORS]) {
    const sorted = [...list].sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].damage ?? sorted[i - 1].defense ?? 0;
      const cur = sorted[i].damage ?? sorted[i].defense ?? 0;
      assert.ok(cur >= prev, `${sorted[i].id} weaker than ${sorted[i - 1].id}`);
    }
  }
  for (const r of order) assert.ok(RARITY_COLOR[r as keyof typeof RARITY_COLOR] !== undefined);
});
