// Pure game rules, transcribed from the decompiled libgame.so (Boomlings 1.20).

export const ATTR = { Block: 0, Bomb: 1, MegaBomb: 2, Color: 3, MegaColor: 4, IceBomb: 5, Pipe: 6, Skull: 7, Stone: 8, MysteryBox: 9, Changer: 11 };
export const ATTR_NAME = { 0: 'Block', 1: 'Bomb', 2: 'MegaBomb', 3: 'Color', 4: 'MegaColor', 5: 'IceBomb', 6: 'Pipe', 7: 'Skull', 8: 'Stone', 9: 'MysteryBox', 11: 'Changer' };
// PieceColor enum -> sprite tag (GamePiece::colorToString)
export const COLOR_TAG = { 1: 'g', 2: 'r', 3: 'o', 4: 'b', 5: 'p', 6: 'y' };
export const COLOR_RGB = { g: '#5ad24a', r: '#ff4a4a', o: '#ff9a2a', b: '#3fa0ff', p: '#c056ff', y: '#ffe23a' };
// GamePieceManager::randomPieceColor lookup table
const COLOR_TABLE = [1, 4, 3, 2, 5];
export const GRID = 8;

export const rand = Math.random;
export const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1)); // inclusive
export const randRange = (a, b) => a + rand() * (b - a);

export function typeName(color, attr) {
  if (attr === ATTR.Stone) return 'Stone';
  return ATTR_NAME[attr] + '_' + COLOR_TAG[color];
}
export function randomPieceColor(level) {
  const n = level < 5 ? level + 2 : 6;
  const k = Math.ceil(rand() * n); // 1..n
  return k >= 1 && k <= 5 ? COLOR_TABLE[k - 1] : 6;
}
// Scoring
export function basePointsForLen(n) { return ((n + 1) * n) & ~1; }
export function multiplierForChain(c) { const t = [1, 1, 2, 4, 8, 12, 16]; return c + 1 < 8 ? t[c] : 20; }
export function levelModVal(level) { return Math.max(1, 1 + (level - 1) * 0.1); }
export function levelLimitVal(level) { return level === 0 ? basePointsForLen(4) * 20 : (level * 8 + 10) * basePointsForLen(4); }
export function levelTarget(level) { return Math.floor(levelLimitVal(level) * levelModVal(level)); }
export function pointsForChain(chainIdx, len, levelMod) { return Math.floor(basePointsForLen(len) * multiplierForChain(chainIdx) * levelMod); }
export function pointsForSingle(chainIdx, count, levelMod) { return Math.floor(Math.floor(basePointsForLen(count + 1) / 2) * multiplierForChain(chainIdx) * levelMod); }
// Ticker start values (no powerups): Skull 8, MysteryBox 4, IceBomb 4
// timeBoost = active rank of the Time Boost powerup (0..3): skulls +rank, ice bombs +1/+2 at rank 2/3, mystery boxes +1 at rank 3
export function timeForPiece(attr, timeBoost = 0) {
  if (attr === ATTR.Skull) return 8 + timeBoost;
  if (attr === ATTR.IceBomb) return 4 + (timeBoost >= 3 ? 2 : timeBoost === 2 ? 1 : 0);
  if (attr === ATTR.MysteryBox) return 4 + (timeBoost >= 3 ? 1 : 0);
  return 0;
}
export const TITLES = ['Peasant', 'Peasant', 'Squire', 'Grunt', 'Scout', 'Sergeant', 'Boom Boom', 'Boom Beast', 'Boom Brute', 'Boom Champ', 'Boomling', 'Boomlingian', 'Big Boom', 'Mighty Boom', 'Super Boom', 'Mega Boom', 'Master Boom', 'Boom Baron', 'Boom Lord', 'Boom King', 'Boom Emperor', 'Magic Boom', 'Mystic Boom', 'Wizardly Boom', 'Legendary Boom', 'Godlike Boom'];
// First appearance of specials (PlayLayer::specialSpawnForLevel)
export const SPECIAL_INTRO = { 3: ATTR.IceBomb, 5: ATTR.Pipe, 7: ATTR.Skull, 9: ATTR.MysteryBox, 11: ATTR.Stone, 13: ATTR.Changer };
export const TURN_SENSITIVE = new Set([ATTR.IceBomb, ATTR.Pipe, ATTR.Skull, ATTR.MysteryBox, ATTR.Changer]);
export const TICKERS = new Set([ATTR.IceBomb, ATTR.Skull, ATTR.MysteryBox]);

// Spawn probability model (GamePieceManager). `counts(attr)` -> live pieces of that attribute.
export class Chances {
  constructor(getLevel, counts, rank = () => 0) { this.getLevel = getLevel; this.counts = counts; this.rank = rank; this.c = {}; this.megaBomb = 0; this.megaColor = 0; this.reset(); }
  maxCountForAttr(a) {
    const level = this.getLevel();
    if (a === ATTR.Bomb) return 10;
    if (a === ATTR.Color) return 4;
    const cap = { 5: 6, 6: 6, 7: 4, 8: 10, 9: 1, 11: 6 }[a];
    if (cap === undefined) return 0;
    const l = Math.ceil(level);
    return l > 0 ? Math.min(l, cap) : 0;
  }
  isAtMaxCount(a) { return this.counts(a) >= this.maxCountForAttr(a); }
  maxChanceForAttr(a) {
    const level = this.getLevel();
    const t = { 5: [3, 4.0, 0.6], 6: [5, 3.0, 0.5], 7: [7, 2.0, 0.6], 8: [11, 4.0, 0.8], 9: [9, 0.4, 0.4], 11: [13, 5.0, 0.8] }[a];
    if (!t) return 0;
    const [start, base, grow] = t;
    return level >= start ? base + (level - start) * grow : 0;
  }
  modForAttribute(a) {
    let f = 0;
    if (a === 5 || a === 8 || a === 11) f = 0.2; else if (a === 7 || a === 9) f = 0.1; else if (a === 6) f = 0.15; else return 0;
    return this.counts(a) < this.maxCountForAttr(a) ? this.maxChanceForAttr(a) * f : 0;
  }
  reset() { for (const a of [7, 5, 6, 11, 9, 8]) this.c[a] = this.maxChanceForAttr(a) * 0.5; }
  increment() {
    for (const a of [7, 5, 6, 11, 9, 8]) this.c[a] += this.modForAttribute(a);
    // GamePieceManager::incrementChances: slow build-up towards a Mega Bomb / Mega Blob replacement
    if (!this.counts(ATTR.MegaBomb)) this.megaBomb += (this.rank('kPowBombM') >= 3 ? 1.5 : 1) * 0.0015;
    if (!this.counts(ATTR.MegaColor)) this.megaColor += (this.rank('kPowColorM') >= 3 ? 1.5 : 1) * 0.001;
  }
  // GamePieceManager::createRandomPiece: Bombs/Blobs may be upgraded to their Mega version at rank 2+
  upgrade(attr) {
    if (attr === ATTR.Bomb && !this.counts(ATTR.MegaBomb) && this.rank('kPowBombM') > 1 && rand() <= this.megaBomb) { this.megaBomb = 0; return ATTR.MegaBomb; }
    if (attr === ATTR.Color && !this.counts(ATTR.MegaColor) && this.rank('kPowColorM') > 1 && rand() <= this.megaColor) { this.megaColor = 0; return ATTR.MegaColor; }
    return attr;
  }
  spawned(a) {
    if (a === 9) { this.c[9] = -4.0; return; }
    if (this.c[a] === undefined) return;
    const max = this.maxCountForAttr(a);
    const ratio = max === 0 ? 0 : (max - this.counts(a)) / max;
    this.c[a] *= ratio;
  }
  attrChance(a) {
    const level = this.getLevel();
    if (this.isAtMaxCount(a) && a !== ATTR.Color) return 0;
    let v;
    if (a === ATTR.Bomb) {
      const k = Math.floor(Math.max(0, 2 - this.counts(1)) * 1.5 + 1);
      v = Math.min((level * 0.5 + 8) * k, k * 12);
      if (this.rank('kPowBombM') > 0) v *= 1.1;
    } else if (a === ATTR.Color) {
      const cnt = this.counts(3);
      const k = Math.floor(Math.max(0, 1 - cnt) * 1.5 + 1);
      v = Math.min((level * 0.5 + 8) * k, k * 12);
      if (this.rank('kPowColorM') > 0) v *= 1.1;
      if (cnt >= 6) v *= 0.1; else if (cnt >= 4) v *= 0.2;
    } else {
      v = this.c[a] || 0;
      if (a === ATTR.MysteryBox) { if (this.rank('kPowGreed') >= 3) v *= 1.15; else if (v < 0) v = v; }
    }
    return Math.max(0, v);
  }
  randomAttribute() {
    const r = rand() * 100;
    let acc = 0;
    for (const a of [3, 1, 8, 5, 6, 7, 9, 11]) { acc += this.attrChance(a); if (r < acc) return a; }
    return ATTR.Block;
  }
}

// 8x8 board. Cells: { x, y, piece }.
export class Grid {
  constructor() {
    this.cells = [];
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) this.cells.push({ x, y, piece: null });
  }
  at(x, y) { return x >= 0 && y >= 0 && x < GRID && y < GRID ? this.cells[y * GRID + x] : null; }
  neighbors(c) { return [this.at(c.x + 1, c.y), this.at(c.x - 1, c.y), this.at(c.x, c.y + 1), this.at(c.x, c.y - 1)].filter(Boolean); }
  // AStarGrid::neighborsToNode(node, 2): neighbours of neighbours (includes the centre and the ring).
  neighborsRadius(c, r) {
    if (r === 1) return this.neighbors(c);
    const out = new Set();
    for (const n of this.neighbors(c)) for (const m of this.neighbors(n)) out.add(m);
    return [...out];
  }
  free() { return this.cells.filter((c) => !c.piece); }
  used() { return this.cells.filter((c) => c.piece); }
  pieces() { return this.used().map((c) => c.piece); }
  // AStarNode::addNeighborsOfSameTypeToArray: same colour, not locked, colour != 0 (Stone never chains)
  sameColorGroup(cell) {
    const p = cell.piece;
    if (!p || !p.color) return [];
    const out = [cell], seen = new Set([cell]);
    const stack = [cell];
    while (stack.length) {
      const c = stack.pop();
      for (const n of this.neighbors(c)) {
        if (n.piece && n.piece.color === p.color && !n.piece.locked && !seen.has(n)) { seen.add(n); out.push(n); stack.push(n); }
      }
    }
    return out;
  }
  // BFS through empty cells; returns the path (excluding start, including goal) or null.
  findPath(from, to) {
    if (!to || to.piece || from === to) return null;
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      if (c === to) break;
      for (const n of this.neighbors(c)) if (!n.piece && !prev.has(n)) { prev.set(n, c); q.push(n); }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let c = to; c !== from; c = prev.get(c)) path.push(c);
    return path.reverse();
  }
  reachable(from) {
    const seen = new Set([from]); const q = [from]; const out = [];
    while (q.length) { const c = q.shift(); for (const n of this.neighbors(c)) if (!n.piece && !seen.has(n)) { seen.add(n); out.push(n); q.push(n); } }
    return out;
  }
  // AStarGrid::validMoveExists: a non-frozen piece with an empty neighbour
  validMoveExists() {
    return this.used().some((c) => !c.piece.frozen && this.neighbors(c).some((n) => !n.piece));
  }
}
