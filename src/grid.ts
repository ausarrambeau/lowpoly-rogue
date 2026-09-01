/** Shared tile-grid primitives (used by dungeon generation and runtime pathing). */
export const WALL = 0;
export const FLOOR = 1;

/** BFS walking distance over FLOOR tiles, 4-connected. -1 = unreachable. */
export function bfs(tiles: Uint8Array, width: number, height: number, sx: number, sy: number): Int32Array {
  const dist = new Int32Array(width * height).fill(-1);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return dist;
  const s = sy * width + sx;
  if (tiles[s] !== FLOOR) return dist;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  dist[s] = 0;
  queue[tail++] = s;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const nd = dist[cur] + 1;
    if (cx + 1 < width && tiles[cur + 1] === FLOOR && dist[cur + 1] === -1) { dist[cur + 1] = nd; queue[tail++] = cur + 1; }
    if (cx > 0 && tiles[cur - 1] === FLOOR && dist[cur - 1] === -1) { dist[cur - 1] = nd; queue[tail++] = cur - 1; }
    if (cy + 1 < height && tiles[cur + width] === FLOOR && dist[cur + width] === -1) { dist[cur + width] = nd; queue[tail++] = cur + width; }
    if (cy > 0 && tiles[cur - width] === FLOOR && dist[cur - width] === -1) { dist[cur - width] = nd; queue[tail++] = cur - width; }
  }
  return dist;
}
