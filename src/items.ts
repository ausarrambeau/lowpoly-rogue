/** Item catalogue and loot tables. Pure: no Three.js here. */
import { chance, randInt, pick, weighted, type RNG } from './rng';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ItemKind = 'weapon' | 'armor' | 'potion' | 'gold';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  damage?: number;
  defense?: number;
  heal?: number;
}

export interface ItemDrop {
  def: ItemDef;
  /** Gold value for gold piles, stack count for potions, 1 for gear. */
  amount: number;
}

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xd8d8d8,
  rare: 0x4aa8ff,
  epic: 0xb95cff,
  legendary: 0xffc233,
};

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export const WEAPONS: ItemDef[] = [
  { id: 'rusty_sword', name: 'Rusty Sword', kind: 'weapon', rarity: 'common', damage: 10 },
  { id: 'iron_sword', name: 'Iron Sword', kind: 'weapon', rarity: 'common', damage: 14 },
  { id: 'steel_blade', name: 'Steel Blade', kind: 'weapon', rarity: 'rare', damage: 20 },
  { id: 'war_axe', name: 'War Axe', kind: 'weapon', rarity: 'rare', damage: 24 },
  { id: 'runic_edge', name: 'Runic Edge', kind: 'weapon', rarity: 'epic', damage: 32 },
  { id: 'dragonfang', name: 'Dragonfang', kind: 'weapon', rarity: 'legendary', damage: 42 },
  { id: 'bone_cleaver', name: "Bone King's Cleaver", kind: 'weapon', rarity: 'legendary', damage: 50 },
];

export const ARMORS: ItemDef[] = [
  { id: 'leather_vest', name: 'Leather Vest', kind: 'armor', rarity: 'common', defense: 2 },
  { id: 'chainmail', name: 'Chainmail', kind: 'armor', rarity: 'rare', defense: 5 },
  { id: 'plate_armor', name: 'Plate Armor', kind: 'armor', rarity: 'epic', defense: 9 },
  { id: 'dragon_scale', name: 'Dragon Scale', kind: 'armor', rarity: 'legendary', defense: 14 },
];

export const POTION: ItemDef = { id: 'potion', name: 'Health Potion', kind: 'potion', rarity: 'common', heal: 35 };
export const GOLD: ItemDef = { id: 'gold', name: 'Gold', kind: 'gold', rarity: 'common' };

export const ALL_ITEMS: ItemDef[] = [...WEAPONS, ...ARMORS, POTION, GOLD];
export const itemById = (id: string): ItemDef => {
  const it = ALL_ITEMS.find((i) => i.id === id);
  if (!it) throw new Error(`unknown item ${id}`);
  return it;
};

export type LootSource = 'slime' | 'skeleton' | 'bat' | 'boss' | 'chest';

/** Rarity weights by floor; chests get an extra bump. Legendary excludes the boss cleaver. */
function rollRarity(rng: RNG, floor: number, bump: number): Rarity {
  const f = Math.max(0, floor - 1) + bump;
  return weighted<Rarity>(rng, [
    ['common', Math.max(5, 60 - 15 * f)],
    ['rare', 28 + 6 * f],
    ['epic', 10 + 6 * f],
    ['legendary', 2 + 3 * f],
  ]);
}

function rollGear(rng: RNG, floor: number, bump: number): ItemDef {
  const rarity = rollRarity(rng, floor, bump);
  const pool = (rng() < 0.6 ? WEAPONS : ARMORS).filter((i) => i.rarity === rarity && i.id !== 'bone_cleaver');
  return pool.length ? pick(rng, pool) : pick(rng, WEAPONS.filter((i) => i.rarity === 'common'));
}

const goldPile = (rng: RNG, floor: number): ItemDrop => ({
  def: GOLD,
  amount: randInt(rng, 2 + 3 * floor, 8 + 8 * floor),
});

/** Roll the drops for a defeated enemy or an opened chest. Deterministic given `rng`. */
export function rollLoot(rng: RNG, source: LootSource, floor: number): ItemDrop[] {
  const drops: ItemDrop[] = [];
  switch (source) {
    case 'slime':
      if (chance(rng, 0.55)) drops.push(goldPile(rng, floor));
      if (chance(rng, 0.15)) drops.push({ def: POTION, amount: 1 });
      if (chance(rng, 0.06)) drops.push({ def: rollGear(rng, floor, 0), amount: 1 });
      break;
    case 'bat':
      if (chance(rng, 0.5)) drops.push(goldPile(rng, floor));
      if (chance(rng, 0.1)) drops.push({ def: POTION, amount: 1 });
      if (chance(rng, 0.05)) drops.push({ def: rollGear(rng, floor, 0), amount: 1 });
      break;
    case 'skeleton':
      if (chance(rng, 0.6)) drops.push(goldPile(rng, floor));
      if (chance(rng, 0.18)) drops.push({ def: POTION, amount: 1 });
      if (chance(rng, 0.14)) drops.push({ def: rollGear(rng, floor, 0), amount: 1 });
      break;
    case 'chest':
      drops.push(goldPile(rng, floor));
      drops.push({ def: rollGear(rng, floor, 1), amount: 1 });
      if (chance(rng, 0.5)) drops.push({ def: POTION, amount: randInt(rng, 1, 2) });
      break;
    case 'boss':
      drops.push({ def: itemById('bone_cleaver'), amount: 1 });
      drops.push({ def: itemById('dragon_scale'), amount: 1 });
      drops.push({ def: POTION, amount: 2 });
      for (let i = 0; i < 3; i++) drops.push(goldPile(rng, floor + 1));
      break;
  }
  return drops;
}
