/** Procedural rooms-and-corridors dungeon on a tile grid. Pure: no Three.js here. */
import { randInt, shuffle, type RNG } from './rng';
import { bfs, FLOOR, WALL } from './grid';

export { FLOOR, WALL };

export interface Point { x: number; y: number }
export interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }

export interface Dungeon {
  floor: number;
  width: number;
  height: number;
  /** Row-major tile grid, WALL or FLOOR. */
  tiles: Uint8Array;
  rooms: Room[];
  /** Player spawn (center of rooms[0]). */
  start: Point;
  /** Stairs / exit (center of the room farthest from start by walking distance). */
  stairs: Point;
}

export interface GenOptions {
  width?: number;
  height?: number;
  minRooms?: number;
  maxRooms?: number;
  minSize?: number;
  maxSize?: number;
}

const DEFAULTS: Required<GenOptions> = {
  width: 48,
  height: 48,
  minRooms: 7,
  maxRooms: 11,
  minSize: 4,
  maxSize: 9,
};

export const idx = (d: { width: number }, x: number, y: number): number => y * d.width + x;

export function inBounds(d: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < d.width && y < d.height;
}

export function isFloor(d: Dungeon, x: number, y: number): boolean {
  return inBounds(d, x, y) && d.tiles[idx(d, x, y)] === FLOOR;
}

function overlaps(a: Room, b: Room, margin: number): boolean {
  return (
    a.x - margin < b.x + b.w &&
    a.x + a.w + margin > b.x &&
    a.y - margin < b.y + b.h &&
    a.y + a.h + margin > b.y
  );
}

function carveRoom(d: Dungeon, r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) d.tiles[idx(d, x, y)] = FLOOR;
}

function carveH(d: Dungeon, x1: number, x2: number, y: number): void {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) d.tiles[idx(d, x, y)] = FLOOR;
}

function carveV(d: Dungeon, y1: number, y2: number, x: number): void {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) d.tiles[idx(d, x, y)] = FLOOR;
}

function placeRooms(rng: RNG, d: Dungeon, o: Required<GenOptions>): Room[] {
  const rooms: Room[] = [];
  for (let attempt = 0; attempt < 200 && rooms.length < o.maxRooms; attempt++) {
    const w = randInt(rng, o.minSize, o.maxSize);
    const h = randInt(rng, o.minSize, o.maxSize);
    const x = randInt(rng, 2, d.width - w - 3);
    const y = randInt(rng, 2, d.height - h - 3);
    const r: Room = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
    if (rooms.some((other) => overlaps(r, other, 2))) continue;
    rooms.push(r);
  }
  return rooms;
}

/** BFS walking distance from `from` over floor tiles. -1 = unreachable. 4-connected. */
export function bfsDistances(d: Dungeon, from: Point): Int32Array {
  return bfs(d.tiles, d.width, d.height, from.x, from.y);
}

export function generateDungeon(rng: RNG, floor: number, opts: GenOptions = {}): Dungeon {
  const o = { ...DEFAULTS, ...opts };
  for (let retry = 0; retry < 25; retry++) {
    const d: Dungeon = {
      floor,
      width: o.width,
      height: o.height,
      tiles: new Uint8Array(o.width * o.height).fill(WALL),
      rooms: [],
      start: { x: 0, y: 0 },
      stairs: { x: 0, y: 0 },
    };
    const rooms = placeRooms(rng, d, o);
    if (rooms.length < o.minRooms) continue;

    // Shuffle so the start room is not spatially biased, then chain rooms with L corridors.
    shuffle(rng, rooms);
    for (const r of rooms) carveRoom(d, r);
    for (let i = 0; i < rooms.length - 1; i++) {
      const a = rooms[i];
      const b = rooms[i + 1];
      if (rng() < 0.5) {
        carveH(d, a.cx, b.cx, a.cy);
        carveV(d, a.cy, b.cy, b.cx);
      } else {
        carveV(d, a.cy, b.cy, a.cx);
        carveH(d, a.cx, b.cx, b.cy);
      }
    }
    // One extra loop corridor so the map is not a pure chain.
    if (rooms.length > 3) {
      const a = rooms[0];
      const b = rooms[Math.floor(rooms.length / 2)];
      carveH(d, a.cx, b.cx, a.cy);
      carveV(d, a.cy, b.cy, b.cx);
    }

    d.rooms = rooms;
    d.start = { x: rooms[0].cx, y: rooms[0].cy };
    const dist = bfsDistances(d, d.start);
    let best = rooms[0];
    let bestDist = -1;
    for (const r of rooms) {
      const dd = dist[idx(d, r.cx, r.cy)];
      if (dd > bestDist) {
        bestDist = dd;
        best = r;
      }
    }
    if (best === rooms[0]) continue;
    d.stairs = { x: best.cx, y: best.cy };
    return d;
  }
  throw new Error('generateDungeon: failed to produce a valid dungeon');
}

/** Random floor tile inside a room, excluding its 1-tile border so props don't block doors. */
export function randomTileInRoom(rng: RNG, r: Room): Point {
  const x = randInt(rng, r.x + 1, Math.max(r.x + 1, r.x + r.w - 2));
  const y = randInt(rng, r.y + 1, Math.max(r.y + 1, r.y + r.h - 2));
  return { x, y };
}
