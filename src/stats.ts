/** Combat math and comparison helpers. Pure. */
import type { ItemDef } from './items';
import type { RNG } from './rng';

export interface DamageRoll {
  damage: number;
  crit: boolean;
}

/** base ±variance, 10% crit for double. Always at least 1. */
export function rollDamage(rng: RNG, base: number, variance = 0.2, critChance = 0.1): DamageRoll {
  const spread = 1 + (rng() * 2 - 1) * variance;
  const crit = rng() < critChance;
  const damage = Math.max(1, Math.round(base * spread * (crit ? 2 : 1)));
  return { damage, crit };
}

/** Flat defense reduction with a floor of 1 so nothing is ever fully immune. */
export function applyDefense(damage: number, defense: number): number {
  return Math.max(1, Math.round(damage - defense));
}

export function isUpgrade(current: ItemDef | null, candidate: ItemDef): boolean {
  if (candidate.kind === 'weapon') return (candidate.damage ?? 0) > (current?.damage ?? 0);
  if (candidate.kind === 'armor') return (candidate.defense ?? 0) > (current?.defense ?? 0);
  return false;
}

export interface EnemyDef {
  id: 'slime' | 'skeleton' | 'bat' | 'boss';
  name: string;
  hp: number;
  damage: number;
  speed: number;
  radius: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  color: number;
}

export const ENEMIES: Record<EnemyDef['id'], EnemyDef> = {
  slime: { id: 'slime', name: 'Slime', hp: 22, damage: 6, speed: 2.6, radius: 0.45, aggroRange: 9, attackRange: 1.2, attackCooldown: 1.1, color: 0x5ee06a },
  skeleton: { id: 'skeleton', name: 'Skeleton', hp: 38, damage: 11, speed: 3.6, radius: 0.4, aggroRange: 11, attackRange: 1.4, attackCooldown: 1.0, color: 0xe8e2cf },
  bat: { id: 'bat', name: 'Cave Bat', hp: 16, damage: 7, speed: 5.2, radius: 0.35, aggroRange: 13, attackRange: 1.1, attackCooldown: 0.8, color: 0x6b4c9a },
  boss: { id: 'boss', name: 'Bone King', hp: 320, damage: 22, speed: 3.2, radius: 0.9, aggroRange: 14, attackRange: 2.2, attackCooldown: 1.4, color: 0xf3ead4 },
};

/** Which enemies (and how many) each floor spawns. Boss is always exactly one, in the stairs room. */
export function floorSpawnTable(floor: number): Array<{ id: EnemyDef['id']; min: number; max: number }> {
  if (floor <= 1) return [ { id: 'slime', min: 7, max: 10 }, { id: 'skeleton', min: 3, max: 5 } ];
  return [ { id: 'skeleton', min: 6, max: 8 }, { id: 'bat', min: 6, max: 8 }, { id: 'slime', min: 2, max: 4 } ];
}

export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 6.5;
export const PLAYER_RADIUS = 0.38;
export const PLAYER_ATTACK_RANGE = 2.3;
export const PLAYER_ATTACK_ARC = Math.PI / 2.6; // half-angle
export const PLAYER_ATTACK_COOLDOWN = 0.42;
export const FLOOR_COUNT = 2;
