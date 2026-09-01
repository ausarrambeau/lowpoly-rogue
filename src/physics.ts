/** World<->tile mapping, circle-vs-grid collision, and flow-field steering. Pure. */
import { FLOOR } from './grid';

export const TILE = 2;

export interface Grid {
  solid: Uint8Array;
  width: number;
  height: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export const toTile = (w: number): number => Math.round(w / TILE);
export const toWorld = (t: number): number => t * TILE;

export function passableAt(g: Grid, wx: number, wz: number): boolean {
  const tx = toTile(wx);
  const tz = toTile(wz);
  if (tx < 0 || tz < 0 || tx >= g.width || tz >= g.height) return false;
  return g.solid[tz * g.width + tx] === FLOOR;
}

/** True when a circle of radius r at (x,z) touches no solid tile (8 sample points). */
export function circleFree(g: Grid, x: number, z: number, r: number): boolean {
  return (
    passableAt(g, x - r, z - r) &&
    passableAt(g, x + r, z - r) &&
    passableAt(g, x - r, z + r) &&
    passableAt(g, x + r, z + r) &&
    passableAt(g, x, z - r) &&
    passableAt(g, x, z + r) &&
    passableAt(g, x - r, z) &&
    passableAt(g, x + r, z)
  );
}

/** Axis-separated move so entities slide along walls instead of sticking. Mutates pos. */
export function slideMove(g: Grid, pos: Vec2, dx: number, dz: number, r: number): { blockedX: boolean; blockedZ: boolean } {
  let blockedX = false;
  let blockedZ = false;
  if (dx !== 0) {
    const nx = pos.x + dx;
    if (circleFree(g, nx, pos.z, r)) pos.x = nx;
    else blockedX = true;
  }
  if (dz !== 0) {
    const nz = pos.z + dz;
    if (circleFree(g, pos.x, nz, r)) pos.z = nz;
    else blockedZ = true;
  }
  return { blockedX, blockedZ };
}

/**
 * Unit direction an enemy should move, descending a BFS field rooted at the target.
 * Goes straight at the target when adjacent; otherwise steps to the best neighbour tile
 * (diagonals only when both orthogonal tiles are open, so nothing clips corners).
 */
export function flowStep(g: Grid, field: Int32Array, from: Vec2, target: Vec2): Vec2 | null {
  const tx = toTile(from.x);
  const tz = toTile(from.z);
  if (tx < 0 || tz < 0 || tx >= g.width || tz >= g.height) return null;
  const here = field[tz * g.width + tx];
  if (here < 0) return null;
  const ddx = target.x - from.x;
  const ddz = target.z - from.z;
  const d = Math.hypot(ddx, ddz);
  if (here <= 1 || d < TILE * 1.2) return d > 1e-4 ? { x: ddx / d, z: ddz / d } : null;

  let best = here;
  let bx = tx;
  let bz = tz;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = tx + ox;
      const nz = tz + oy;
      if (nx < 0 || nz < 0 || nx >= g.width || nz >= g.height) continue;
      const v = field[nz * g.width + nx];
      if (v < 0) continue;
      if (ox && oy && (g.solid[tz * g.width + nx] !== FLOOR || g.solid[nz * g.width + tx] !== FLOOR)) continue;
      if (v < best) {
        best = v;
        bx = nx;
        bz = nz;
      }
    }
  }
  if (bx === tx && bz === tz) return null;
  const gx = toWorld(bx) - from.x;
  const gz = toWorld(bz) - from.z;
  const gl = Math.hypot(gx, gz);
  return gl > 1e-4 ? { x: gx / gl, z: gz / gl } : null;
}
