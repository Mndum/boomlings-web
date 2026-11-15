import { basePointsForLen, ATTR, COLOR_TAG, GRID, rand, randInt, randRange, typeName, randomPieceColor, pointsForChain, pointsForSingle, levelTarget, levelModVal, timeForPiece, multiplierForChain, SPECIAL_INTRO, TURN_SENSITIVE, TICKERS, TITLES, Chances, Grid } from './rules.js';
import { Animator } from './anim.js';
const bounceOut = (t) => { if (t < 1 / 2.75) return 7.5625 * t * t; if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; } if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; } t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375; };
const easeIO2 = (t) => (t < 0.5 ? 0.5 * Math.pow(2 * t, 2) : 1 - 0.5 * Math.pow(2 * (1 - t), 2));
const SHOP_DROP = 240, SHOP_BAR_Y = 273.3;

export const CELL = 80, GRID_X = 0, GRID_Y = 105.2; // HD px, canvas is 640x960; grid layer is at (0,108) in the game's 320x480 y-up points
const W = 640, H = 960;
const BOMBISH = new Set([ATTR.Bomb, ATTR.MegaBomb, ATTR.IceBomb, ATTR.Skull, ATTR.MysteryBox]);
const SFX = {
  pop: ['pops2a.ogg', 'pop2b2.ogg'], bomb: 'bombbbb.ogg', mega: 'megaExplode001.ogg', frost: 'frostBoom2.ogg', skullEnter: 'skullTest.ogg',
  skullDeath: 'skullEnding002.ogg', mysteryEnter: 'mysteryAppear.ogg', mysteryTrigger: 'mysteryTrigger001.ogg', spinner: 'spinner.ogg',
  reward: ['mysteryReward001.ogg', 'mysteryReward002.ogg', 'mysteryReward003.ogg'], pipeEnter: 'pipeenter02.ogg', splat: 'splat03.ogg', megaSplat: 'megaSplat001.ogg',
  changer: 'splatSound.ogg', stoneHit: 'stoneHit1_m.ogg', stoneBreak: 'stoneHit2.ogg', levelComplete: 'levelComplete002.ogg', levelUp: 'lvlup003.ogg',
  chain: 'chainTest01.ogg', whoa: 'whoa.ogg', alert: 'alert04.ogg', select: 'click01.ogg', deselect: 'click05.ogg', megaEnter: 'megaEnter.ogg', noMoves: 'res02.ogg',
  usePow: 'lightning5.ogg', lvlPulse: 'lvlPulse.ogg', highscore: 'highscoreGet02.ogg',
};
export const SFX_ALL = Object.values(SFX).flat().concat(['click07.ogg', 'pause01.ogg', 'getAch001.ogg', 'unlock004.ogg', 'buyGold001.ogg', 'counter001.ogg', 'showTutorial.ogg', 'starSound02.ogg']);

// XP needed to go from rank L-1 to L (GameManager::requiredXPForLevel)
export const requiredXP = (L) => Math.floor(L * 5000 + L * 560 * L);
export const MAX_RANK = 25;

// GameTutorialManager: the scripted first game. Cells are (column,row); text positions are in the real 480x800 screen
// (converted when drawn). Piece codes: colour g r o b p y, optional suffix B = bomb, C = blob.
const TUT_COLOR = { g: 1, r: 2, o: 3, b: 4, p: 5, y: 6 };
const TUT_STEPS = [
  { popup: ['basics', 'tutorial_basics_001'], keep: false, add: ['r3,5', 'r4,5', 'r5,5', 'r6,2'], mover: [6, 2], target: [6, 5], text: [[['Tap and slide', 'g']], [['OR', 'w']], [['Tap + Tap', 'g']]], textPos: [[170, 230], [170, 275], [180, 320]] },
  { keep: false, add: ['b3,2', 'b3,3', 'b3,5', 'b3,6', 'b6,4'], mover: [6, 4], target: [3, 4], text: [] },
  { keep: false, add: ['g1,3', 'g3,5', 'g4,5', 'gB5,5', 'y6,5', 'r5,4', 'b5,6'], mover: [1, 3], target: [2, 5], text: [[['Bombs', 'g'], [' destroy', 'r']], [['surrounding', 'w']], [['blocks', 'w']]], textPos: [[290, 170], [290, 215], [300, 262]] },
  { keep: false, add: ['pC2,3', 'g5,2', 'r6,2', 'b6,3', 'b5,4', 'y6,4'], mover: [2, 3], target: [5, 3], text: [[['Blobs', 'g']], [['RECOLOR', 'y']], [['BLOCKS', 'w']]], textPos: [[140, 410], [140, 457], [150, 500]] },
  { keep: false, add: ['p2,3', 'p5,2', 'p6,2', 'p5,3', 'p6,3', 'p5,4', 'p6,4'], mover: [2, 3], target: [4, 3], text: [[['New ', 'w'], ['Objects', 'y'], [' spawn', 'w']], [['after each ', 'w'], ['move', 'g']], [['you make!', 'w']]], textPos: [[230, 455], [230, 500], [230, 548]] },
  { popup: ['basics2', 'tutorial_basics2_001'], keep: false, add: ['r0,4', 'r1,4', 'r2,4', 'b4,4', 'b5,4', 'b6,4', 'b7,4', 'rB3,2'], mover: [3, 2], target: [3, 4], text: [[['Bombs', 'g'], [' can create', 'w']], [['Chain Reactions', 'y']], [['for more points!', 'w']]], textPos: [[240, 457], [240, 500], [240, 548]] },
  { keep: true, add: ['r1,1'], mover: [1, 1], target: [1, 3], text: [[['Bombs', 'g'], [' can create', 'w']], [['Chain Reactions', 'y']], [['for more points!', 'w']]], textPos: [[240, 457], [240, 500], [240, 548]] },
  { keep: false, add: ['g3,0', 'g3,1', 'g4,1', 'g5,1', 'bB6,1', 'b6,2', 'b6,3', 'b6,4', 'r3,5', 'r4,5', 'rB5,5', 'r1,2'], mover: [1, 2], target: [2, 4], last: true, text: [[['Fill', 'g'], [' the bar to', 'w']], [['COMPLETE', 'g'], [' the level!', 'w']]], textPos: [[240, 470], [240, 515]] },
];
// GamePiece::getStrongColorValue (r,g,b / 255) per PieceColor
const STRONG_COLOR = { 0: [1, 1, 1], 1: [100 / 255, 1, 80 / 255], 2: [1, 110 / 255, 150 / 255], 3: [1, 165 / 255, 75 / 255], 4: [100 / 255, 165 / 255, 1], 5: [1, 110 / 255, 250 / 255], 6: [1, 1, 100 / 255] };
const TUT_RGB = { g: '#3de52b', r: '#ff6470', y: '#fff02a', w: '#ffffff' };

class Piece {
  constructor(scene, color, attr) {
    this.scene = scene;
    this.id = scene.nextId++;
    this.attr = attr;
    this.color = attr === ATTR.Stone ? 0 : color;
    this.type = typeName(color, attr);
    this.anim = new Animator(scene.G.lib, this.type);
    this.cell = null; this.px = 0; this.py = 0; this.scale = 1; this.alpha = 1; this.rot = 0;
    this.frozen = attr === ATTR.Stone || attr === ATTR.Pipe; // immovable
    this.iced = false; // ice overlay (frozen by an ice bomb)
    this.locked = false; this.chainId = 0; this.activatedByBomb = false;
    this.health = 2;
    this.turnSensitive = TURN_SENSITIVE.has(attr);
    this.tick = timeForPiece(attr, scene.rank('kPowTimeBoost'));
    this.dead = false; this.removed = false; this.moving = false; this.exploding = false;
    this.idleTimer = randRange(2, 7);
    this.shake = 0;
  }
  idleNext() {
    const lib = this.scene.G.lib, r = Math.random(), want = r < 0.8 ? 'Idle01' : r < 0.95 ? 'Idle02' : 'Idle03';
    const name = lib.get(this.type, want) ? want : 'Idle01';
    if (!lib.get(this.type, name)) return;
    this.anim.play(name, false, () => { if (!this.dead && !this.exploding && this.anim.name === name) this.idleNext(); });
  }
  setColor(color) { this.color = color; this.type = typeName(color, this.attr); this.anim.setType(this.type); }
  update(dt) {
    this.anim.update(dt);
    // GamePiece::animationFinished (disassembled): once an idle animation ends, every piece except Color blobs / Mega blobs / Changers
    // rolls r = rand()/RAND_MAX: r < 0.8 -> Idle01, r < 0.95 -> Idle02, else Idle03 (Idle01/02 = 18 frames, Idle03 = 56 frames at 1/12s)
    if (!this.exploding && this.attr !== ATTR.Color && this.attr !== ATTR.MegaColor && this.attr !== ATTR.Changer) {
      const a = this.anim, idle = a.name === 'Idle01' || a.name === 'Idle02' || a.name === 'Idle03';
      if (idle && a.loop) this.idleNext();   // other code resumes with play('Idle01', true): turn that into the real chain
    }
    if (this.shake > 0) this.shake -= dt;
  }
}

export class PlayScene {
  constructor(G) {
    this.G = G;
    this.nextId = 1;
    this.timers = [];
    this.reset();
  }
  get save() { return this.G.save; }
  get ach() { return this.G.ach; }
  rank(tag) { return this.equipped && this.equipped.includes(tag) ? this.save.powRank(tag) : 0; }
  reset() {
    this.grid = new Grid();
    this.pieces = [];
    this.effects = [];
    this.timers = [];
    this.level = 0; this.levelPoints = 0; this.target = 1; this.score = 0; this.bonusGold = 0; this.xp = 0; this.moves = 0; this.levelMoves = 0; this.playTime = 0;
    this.timeFrozen = 0; this.counts = {};
    this.equipped = [null, null, null];
    this.charges = {};
    this.chances = new Chances(() => this.level, (a) => this.counts[a] || 0, (t) => this.rank(t));
    this.selected = null; this.reachable = new Set(); this.path = null; this.movingPiece = null;
    this.busy = false; this.over = false; this.overReason = null; this.paused = false; this.turn = null; this.skullDeath = null;
    this.bigText = null; this.danger = false; this.summary = null; this.shop = null; this.ankh = false; this.levelText = null;
    this.boomMult = 1; this.flatMult = false;
    this.noBombs = true; this.onlyCombos = true; this.shortcut = false; this.revived = false; this.started = false;
    this.pointer = { down: false, cell: null };
  }
  wait(ms) { return new Promise((res) => this.timers.push({ left: ms / 1000, res })); }
  count(a) { return this.counts[a] || 0; }

  // ---- lifecycle ----
  // opts: { startLevel }
  async startNewGame(opts = {}) {
    this.reset();
    this.equipped = this.save.d.equipped.slice(0, this.save.d.slots).concat([null, null, null]).slice(0, 3);
    for (const tag of this.equipped) {
      if (!tag) continue;
      const p = this.G.store.pow(tag).ranks[this.save.powRank(tag) - 1];
      if (p && p.usable) this.charges[tag] = p.charges;
    }
    this.started = true;
    this.G.audio.playMusic('BoomlingsLoop.mp3', 0.45);
    this.busy = true;
    if ((!opts.startLevel || opts.startLevel <= 1) && !this.save.seen('tutDone') && this.G.app) { await this.runTutorial(); return; }
    if (opts.startLevel && opts.startLevel > 1) { this.level = opts.startLevel - 1; this.shortcut = true; }
    await this.nextLevel();
    this.busy = false;
    if (this.G.app && this.equipped.some(Boolean)) this.G.app.tutorial('powTut', 'tutorial_powTut_001');
  }
  // ---- scripted tutorial ----
  async runTutorial() {
    this.tut = { i: -1, trail: 0 };
    this.level = 1; this.target = 3000; this.levelPoints = 0; this.score = 0; // scored as level 1; the HUD shows 0
    await this.tutNext();
  }
  async tutNext() {
    const t = this.tut; t.i += 1;
    if (t.i >= TUT_STEPS.length) return this.tutFinish();
    const st = TUT_STEPS[t.i];
    if (st.popup) await new Promise((res) => this.G.app.tutorial(st.popup[0], st.popup[1], res));
    if (!st.keep) for (const p of this.pieces.slice()) { this.removePiece(p); p.removed = true; }
    this.pieces = this.pieces.filter((p) => !p.removed);
    for (const code of st.add) {
      const m = /^([grobpy])([BC]?)(\d),(\d)$/.exec(code), attr = m[2] === 'B' ? ATTR.Bomb : m[2] === 'C' ? ATTR.Color : ATTR.Block;
      const cell = this.grid.at(+m[3], +m[4]); this.addPiece(this.createPiece(TUT_COLOR[m[1]], attr), cell, true);
    }
    this.tut.step = st; this.tut.textOutAt = null; this.tut.endAt = null; this.tut.t0 = performance.now() / 1000; this.busy = false; this.deselect();
  }
  tutFinish() {
    this.save.markSeen('tutDone'); this.save.markSeen('basics'); this.save.markSeen('basics2');
    this.tut = null; this.busy = true;
    for (const p of this.pieces.slice()) { this.removePiece(p); p.removed = true; }
    this.level = 0; this.score = 0; this.xp = 0; this.bonusGold = 0; this.moves = 0; this.counts = {};
    this.nextLevel().then(() => { this.busy = false; });
  }
  tutCell(c) { return c ? this.grid.at(c[0], c[1]) : null; }
  cellCenter(c) { return [GRID_X + (c.x + 0.5) * CELL, GRID_Y + (c.y + 0.5) * CELL]; }
  cellAtPoint(x, y) {
    const gx = Math.floor((x - GRID_X) / CELL), gy = Math.floor((y - GRID_Y) / CELL);
    return this.grid.at(gx, gy);
  }

  // ---- pieces ----
  createPiece(color, attr) {
    const p = new Piece(this, color, attr);
    this.counts[attr] = this.count(attr) + 1;
    this.chances.spawned(attr);
    return p;
  }
  addPiece(p, cell, enter = true) {
    cell.piece = p; p.cell = cell;
    [p.px, p.py] = this.cellCenter(cell);
    this.pieces.push(p);
    if (enter) {
      p.scale = 0.1; p.alpha = 0;
      this.tween(p, { scale: 1 }, 0.3, easeIO2);   // CCScaleTo 0.3 + CCEaseInOut(2), as traced
      this.tween(p, { alpha: 1 }, 0.15);                                                              // CCFadeIn 0.15
      if (p.attr === ATTR.Pipe) p.anim.play('EnterAnim', false, () => p.anim.play('Idle01', true));
      this.introTut(p.attr);
      if (p.attr === ATTR.Skull) this.sfx(SFX.skullEnter, 0.7);
      else if (p.attr === ATTR.MysteryBox) this.sfx(SFX.mysteryEnter, 0.8);
      else if (p.attr === ATTR.Pipe) this.sfx(SFX.pipeEnter, 0.7);
      else if (p.attr === ATTR.MegaBomb || p.attr === ATTR.MegaColor) this.sfx(SFX.megaEnter, 0.7);
    }
    return p;
  }
  // GameManager::showTutorialForPiece: first appearance of ice bomb / skull / mystery box / stone
  introTut(attr) {
    const f = { [ATTR.IceBomb]: 'tutorial_iceBomb_001', [ATTR.Skull]: 'tutorial_skull_001', [ATTR.MysteryBox]: 'tutorial_mysteryBox_001', [ATTR.Stone]: 'tutorial_stone_001' }[attr];
    if (f && this.G.app) setTimeout(() => this.G.app.tutorial('piece' + attr, f), 500);
  }
  unbind(p) { if (p.cell && p.cell.piece === p) p.cell.piece = null; }
  removePiece(p) {
    if (p.dead) return;
    p.dead = true;
    this.unbind(p);
    this.counts[p.attr] = Math.max(0, this.count(p.attr) - 1);
  }
  spawnRandomAt(cell, enter = true) {
    const attr = this.chances.upgrade(this.chances.randomAttribute());
    const color = randomPieceColor(this.level);
    return this.addPiece(this.createPiece(color, attr), cell, enter);
  }
  async spawnPieces(n, gap = 60) {
    const free = this.grid.free();
    n = Math.min(n, free.length);
    for (let i = 0; i < n && !this.over; i++) {
      const freeNow = this.grid.free();
      if (!freeNow.length) break;
      this.spawnRandomAt(freeNow[randInt(0, freeNow.length - 1)]);
      if (gap) await this.wait(gap);
    }
  }
  // GameManager::nextLevel + PlayLayer::startNextLevel
  async nextLevel() {
    this.level += 1;
    this.levelPoints = 0; this.target = levelTarget(this.level); this.levelMoves = 0;
    this.counts = {}; this.timeFrozen = 0;
    this.chances.reset();
    this.ach.onLevel(this.level, { noBombs: this.noBombs, onlyCombos: this.onlyCombos, shortcut: this.shortcut, time: this.playTime });
    this.save.setMax('maxLevel', this.level);
    if (this.level === 1) this.openShop();
    this.levelText = { text: 'LEVEL ' + this.level, t: this.level === 1 ? 0.25 : 0 }; // PlayLayer::showLevelText: delay .5, FadeIn .5, delay .5, FadeOut .5
    this.sfx(SFX.levelUp, 0.8);
    if (this.level >= 5 && this.G.app) this.G.app.tutorial('items', 'tutorial_items');
    if (this.level > 1) await this.wait(700);
    let special = false;
    const intro = SPECIAL_INTRO[this.level];
    if (intro !== undefined && this.count(intro) < 1) {
      const free = this.grid.free();
      if (free.length) { this.addPiece(this.createPiece(randomPieceColor(this.level), intro), free[randInt(0, free.length - 1)]); special = true; }
    }
    const n = this.level === 1 ? 10 : Math.min(20, (special ? 14 : 15) + Math.floor(this.level * 0.25));
    await this.spawnPieces(n, this.level === 1 ? 0 : 60);
  }


  // ---- IngameShop (GameManager::showItemShop): drawer dropping from behind the HUD at the start of level 1 ----
  shopItems() {
    const st = this.G.store, mx = this.save.stat('maxLevel') || 0, f = [];
    if (mx > 4) f.push('kItemSkip'); if (mx > 9) f.push('kItemSkipB'); if (mx > 14) f.push('kItemSkipC'); f.push('kItemRes');
    return f.map((k) => st.items.find((i) => i.feature === k && !/x\d+/.test(i.title))).filter(Boolean);
  }
  openShop() {
    if (this.shop || this.tut || !this.G.app || this.level !== 1) return;
    // the drawer starts moving when the scene is created, i.e. before the screen fade has finished
    this.shop = { t: 0.25, hiding: false, th: 0, items: this.shopItems(), used: {} };
  }
  hideShop() { if (this.shop && !this.shop.hiding) { this.shop.hiding = true; this.shop.th = 0; } }
  updateShop(dt) { const s = this.shop; if (!s) return; if (s.hiding) { s.th += dt; if (s.th >= 0.5) this.shop = null; } else s.t += dt; }
  shopOff() { const s = this.shop; return s.hiding ? -SHOP_DROP * easeIO2(Math.min(1, s.th / 0.5)) : -SHOP_DROP * (1 - bounceOut(Math.min(1, s.t / 1.0))); }
  shopSlots() { const n = this.shop.items.length, sp = 110; return this.shop.items.map((it, i) => ({ it, x: 320 + (i - (n - 1) / 2) * sp, y: 176 })); }
  drawShop(ctx) {
    const s = this.shop; if (!s) return;
    const { ui, fonts } = this.G, off = this.shopOff();
    ctx.save(); ctx.translate(0, off);
    ctx.fillStyle = 'rgba(0,0,0,0.588)'; ctx.fillRect(160, -400, 320, SHOP_BAR_Y + 400);
    const gold = this.save.gold;
    fonts.gold.draw(ctx, String(gold), 432, 121.3, { align: 'right', scale: 0.95 });
    if (this.G.coin) ctx.drawImage(this.G.coin, 456 - 20, 121.3 - 20, 40, 40);
    for (const { it, x, y } of this.shopSlots()) {
      const [iw, ih] = ui.size(it.icon); ui.draw(ctx, it.icon, x, y, { scale: 108 / Math.max(iw, ih), alpha: s.used[it.feature] ? 0.4 : 1 });
      const num = String(it.price), nw = fonts.gold.measure(num, 0.72), gx = x - (nw + 32) / 2 - 6;
      fonts.gold.draw(ctx, num, gx, y + 47, { align: 'left', scale: 0.72 }); if (this.G.coin) ctx.drawImage(this.G.coin, gx + nw - 4, y + 47 - 20, 40, 40);
    }
    ui.draw(ctx, 'shopItemBar_001.png', 320, SHOP_BAR_Y);
    ui.draw(ctx, 'CloseBtn_001.png', 186.7, SHOP_BAR_Y, { scale: 0.78 });
    fonts.big.draw(ctx, 'ITEM SHOP', 342, SHOP_BAR_Y + 1, { scale: 221 / fonts.big.measure('ITEM SHOP', 1) });
    ctx.restore();
  }
  // returns true when the tap was consumed by the drawer
  shopTap(x, y) {
    const s = this.shop; if (!s || s.hiding) return false;
    const off = this.shopOff(), ty = y - off;
    if (ty > SHOP_BAR_Y - 28 && ty < SHOP_BAR_Y + 28 && x > 158 && x < 484) { this.hideShop(); return true; }
    for (const sl of this.shopSlots()) {
      if (Math.abs(x - sl.x) < 52 && Math.abs(ty - sl.y - 20) < 70) { if (!s.used[sl.it.feature]) this.shopPress(sl.it); return true; }
    }
    return false;
  }
  shopPress(it) {
    const d = this.save.d, owned = d.items[it.feature] || 0, skip = it.feature !== 'kItemRes';
    if (owned < 1 && !skip) {
      const afford = this.save.gold >= it.price;
      this.G.app.go(new this.G.app.Confirm(this.G.app, { title: it.title, icon: it.icon, desc: it.desc.replace(/\n/g, ' '), price: it.price }, 'Buy', afford, () => {
        if (!this.G.store.buyItem(it).ok) return;
        this.G.audio.play('buyGold001.ogg', 0.8); this.shopUse(it, true);
      }));
      return;
    }
    this.shopUse(it, false);
  }
  async shopUse(it, bought) {
    const d = this.save.d; if ((d.items[it.feature] || 0) > 0) d.items[it.feature]--; this.save.flush();
    this.shop.used[it.feature] = true;
    if (it.feature === 'kItemRes') this.ankh = true;
    else {
      const to = { kItemSkip: 4, kItemSkipB: 9, kItemSkipC: 14 }[it.feature];
      this.hideShop(); this.busy = true; this.shortcut = true;
      for (const p of this.pieces.slice()) { this.removePiece(p); p.removed = true; }
      this.level = to; await this.nextLevel(); this.busy = false; return;
    }
    if (this.shop.items.every((q) => this.shop.used[q.feature])) this.hideShop();
  }

  // ---- input ----
  pointerDown(x, y) {
    if (this.busy || this.over || this.paused) return;
    const cell = this.cellAtPoint(x, y);
    this.pointer = { down: true, cell, x, y };
    if (!cell) { this.deselect(); return; }
    if (this.tut && this.tut.step) { const st = this.tut.step, mv = this.tutCell(st.mover), tg = this.tutCell(st.target); if (cell.piece && cell !== mv) return; if (!cell.piece && !(this.selected === mv && cell === tg)) return; }
    if (cell.piece) {
      if (cell.piece.frozen) { this.deselect(); return; }
      if (this.selected === cell) { this.deselect(); return; }
      this.select(cell);
      return;
    }
    if (this.selected) {
      const path = this.grid.findPath(this.selected, cell);
      if (path) { this.beginMove(this.selected.piece, path); return; }
    }
    this.deselect();
  }
  pointerUp(x, y) {
    const was = this.pointer; this.pointer = { down: false, cell: null };
    if (this.busy || this.over || this.paused || !this.selected) return;
    const cell = this.cellAtPoint(x, y);
    if (!cell || cell === this.selected || cell.piece) return;
    if (this.tut && this.tut.step && cell !== this.tutCell(this.tut.step.target)) return;
    if (was.cell && was.cell === this.selected) {
      const path = this.grid.findPath(this.selected, cell);
      if (path) this.beginMove(this.selected.piece, path);
    }
  }
  select(cell) {
    this.selected = cell;
    this.reachable = new Set(this.grid.reachable(cell));
    this.sfx(SFX.select, 0.5);
  }
  deselect() { if (this.selected) this.sfx(SFX.deselect, 0.3); this.selected = null; this.reachable = new Set(); }

  // ---- powerups ----
  // Slot buttons in the bottom strip: [{ i, tag, x, y, size, usable, left }]
  powerButtons() {
    if (this.tut) return [];   // the tutorial game has no powerup slots (real bottom panel is empty)
    // UILayer::setupPowerupSlots: buttons are centred, spaced by (sprite width + 30) points, vertically
    // centred in the bottom panel (scaled height 91pt -> centre 44.5pt from the bottom).
    const eq = this.equipped.map((tag, i) => ({ tag, i })).filter((e) => e.tag);
    const n = eq.length, out = [];
    if (!n) return out;
    const first = this.G.store.pow(eq[0].tag).ranks[this.save.powRank(eq[0].tag) - 1];
    const wpt = this.G.ui.size(first.icon)[0] / 2;
    const total = n * wpt + (n - 1) * 30;
    let x = Math.floor((320 - total) * 0.5) + Math.floor(wpt / 2);
    for (const { tag, i } of eq) {
      const r = this.save.powRank(tag), def = this.G.store.pow(tag).ranks[r - 1];
      out.push({ i, tag, x: x * 2, y: (480 - 44.5) * 2, size: wpt * 2, def, usable: def.usable, left: this.charges[tag] || 0 });
      x += wpt + 30;
    }
    return out;
  }
  canUsePower(tag) {
    if (this.busy || this.over || this.paused || !(this.charges[tag] > 0)) return false;
    if (tag === 'kPowBOOM') return this.pieces.some((p) => !p.dead && (p.attr === ATTR.Bomb || p.attr === ATTR.MegaBomb));
    if (tag === 'kPowSkullBlast') return this.pieces.some((p) => !p.dead && (p.attr === ATTR.Skull || (p.attr === ATTR.IceBomb && this.rank(tag) >= 2) || (p.attr === ATTR.Stone && this.rank(tag) >= 3)));
    if (tag === 'kPowTimeFreeze') return this.timeFrozen < 1;
    return true;
  }
  usePower(tag) {
    if (this.G.app) this.G.app.tutorial('pow02', 'tutorial_pow02_001');
    if (!this.canUsePower(tag)) return false;
    this.hideShop();
    this.charges[tag]--; this.deselect(); this.busy = true; this.sfx(SFX.usePow, 0.8);
    this.save.inc('powersUsed');
    const run = tag === 'kPowBOOM' ? this.useBoom() : tag === 'kPowSkullBlast' ? this.useSkullBlast() : tag === 'kPowTimeFreeze' ? this.useTimeFreeze() : this.useLevelSkip();
    run.catch((e) => { console.error(e); this.busy = false; });
    return true;
  }
  // GameTurnManager::detonateAllBombs + GameManager::detonatedAllBombs
  async useBoom() {
    const r = this.rank('kPowBOOM');
    this.boomMult = r >= 3 ? 2 : r === 2 ? 1.5 : 1; this.flatMult = true;
    this.turn = { chainCount: 0, active: new Set(), specials: new Set(), tasks: [], bombs: 0, colors: new Set() };
    this.showBigText('BOOM!', 1.2, 0.9);
    const bombs = this.pieces.filter((p) => !p.dead && (p.attr === ATTR.Bomb || p.attr === ATTR.MegaBomb));
    let i = 0;
    for (const b of bombs) {
      if (b.dead) continue;
      const group = this.grid.sameColorGroup(b.cell);
      if (group.length >= 4 && !b.chainId) this.turn.tasks.push(this.startChain(group, b.cell));
      else this.destroyPiece(b, 0, i);
      i++;
      await this.wait(90);
    }
    await this.drainTasks();
    await this.handleSpecials();
    await this.finishTurnStats();
    this.turn = null;
    return this.endTurn();
  }
  async useSkullBlast() {
    const r = this.rank('kPowSkullBlast');
    this.turn = { chainCount: 0, active: new Set(), specials: new Set(), tasks: [], bombs: 0, colors: new Set() };
    let i = 0;
    for (const p of this.pieces.slice()) {
      if (p.dead) continue;
      if (p.attr === ATTR.Skull || (p.attr === ATTR.IceBomb && r >= 2) || (p.attr === ATTR.Stone && r >= 3)) {
        if (p.attr === ATTR.Stone) p.health = 0;
        this.destroyPiece(p, 0, i++); await this.wait(80);
      }
    }
    await this.drainTasks(); this.turn = null;
    await this.wait(300);
    return this.endTurn();
  }
  async useTimeFreeze() {
    const r = this.rank('kPowTimeFreeze');
    this.timeFrozen = r === 2 ? 4 : r >= 3 ? 5 : 3;
    this.showBigText('TIME FREEZE', 1.0, 1.0);
    await this.wait(500);
    this.busy = false;
  }
  async useLevelSkip() {
    this.shortcut = true;
    if (this.pieces.some((p) => !p.dead && p.attr === ATTR.Skull && p.tick <= 1)) this.ach.report('boomlings.ach.cheatDeath');
    await this.levelComplete(true);
    this.busy = false;
  }

  // ---- a turn ----
  beginMove(piece, path) {
    this.hideShop(); this.selected = null; this.reachable = new Set();
    this.busy = true;
    this.runTurn(piece, path).catch((e) => { console.error(e); this.busy = false; });
  }
  async runTurn(piece, path) {
    await this.animateMove(piece, path);
    await this.placeAt(piece);
  }
  async animateMove(piece, path) {
    piece.moving = true; this.movingPiece = piece; this.path = path.slice();
    this.unbind(piece);
    // PlayLayer::attachTrailToPiece: trailEffect.plist tinted with GamePiece::getStrongColorValue, emitted in world space (free) and drawn under the pieces
    const trail = this.G.fx && this.G.fx.spawn('trailEffect', piece.px, piece.py, { follow: () => [piece.px, piece.py + 10], color: STRONG_COLOR[piece.color] || STRONG_COLOR[0], layer: 'trail', free: true });
    for (const cell of path) {
      const [tx, ty] = this.cellCenter(cell);
      await this.tweenAsync(piece, { px: tx, py: ty }, 0.08);
      this.path.shift();
    }
    const dest = path[path.length - 1];
    dest.piece = piece; piece.cell = dest;
    if (trail) trail.stop();
    piece.moving = false; this.movingPiece = null; this.path = null;
    this.moves++; this.levelMoves++; this.save.inc('moves');
    if (this.moves === 2 && this.G.app && !this.tut) setTimeout(() => this.G.app.tutorial('basics2', 'tutorial_basics2_001'), 900);
  }
  newTurnState() { return { chainCount: 0, active: new Set(), specials: new Set(), tasks: [], bombs: 0, colors: new Set() }; }
  async placeAt(piece) {
    const a = piece.attr;
    if (BOMBISH.has(a)) return this.endTurn();
    if (a === ATTR.Color || a === ATTR.MegaColor) { await this.activateColor(piece); return this.endTurn(); }
    const group = this.grid.sameColorGroup(piece.cell);
    if (group.length < 4) return this.endTurn();
    this.turn = this.newTurnState();
    this.turn.tasks.push(this.startChain(group, piece.cell));
    await this.drainTasks();
    await this.handleSpecials();
    await this.finishTurnStats();
    this.turn = null;
    return this.endTurn();
  }
  // GameTurnManager::finishTurn achievement checks
  async finishTurnStats() {
    const t = this.turn; if (!t) return;
    this.ach.onBombsInTurn(t.bombs);
    this.ach.onColorsInTurn(t.colors.size);
    if (t.chainCount === 1) this.onlyCombos = false;
  }
  async drainTasks() {
    while (this.turn.tasks.length) {
      const batch = this.turn.tasks; this.turn.tasks = [];
      await Promise.all(batch);
    }
  }
  // PlayLayer::activateColorAt — recolour neighbours to this piece's colour
  async activateColor(piece) {
    const mega = piece.attr === ATTR.MegaColor;
    if (mega) this.ach.onMegaBlobPopped();
    piece.anim.play('Charge', false, () => piece.anim.play('Idle01', true));
    await this.wait(300);
    // GamePiece::animationFinished: once the Charge animation ends the blob turns into a plain Block of its colour
    piece.attr = ATTR.Block; piece.turnSensitive = false; piece.type = typeName(piece.color, ATTR.Block); piece.anim.type = piece.type; piece.anim.play('Idle01', true);
    const cells = this.grid.neighborsRadius(piece.cell, mega ? 2 : 1);
    this.sfx(mega ? SFX.megaSplat : SFX.splat, 0.8);
    const removeIce = this.rank('kPowColorM') >= 3;
    for (const c of cells) {
      const q = c.piece;
      if (!q || q === piece || q.attr === ATTR.Stone) continue; // Stone is immune
      if (q.color === piece.color) { if (removeIce) { q.frozen = q.attr === ATTR.Pipe; q.iced = false; } continue; }
      q.setColor(piece.color);
      if (removeIce && q.iced) { q.iced = false; q.frozen = q.attr === ATTR.Pipe; }
      this.effect('splash', c, { color: COLOR_TAG[piece.color] });
    }
    this.effect('splash', piece.cell, { color: COLOR_TAG[piece.color] });
    await this.wait(450);
  }
  // GameTurnManager::startChain — destroy a same-colour group of >= 4, one piece at a time
  async startChain(group, origin) {
    const t = this.turn;
    const chainId = ++t.chainCount; const chainColor = origin.piece ? origin.piece.color : 0;
    t.colors.add(origin.piece ? origin.piece.color : 0);
    for (const c of group) { c.piece.chainId = chainId; t.active.add(c.piece); }
    this.ach.onChain(chainId, group.length);
    this.ach.onBandits(group.filter((c) => c.piece.attr === ATTR.Changer).length);
    this.save.inc('chains'); this.save.setMax('longestChain', group.length);
    if (chainId > 1 && !this.flatMult) { this.showBigText('x' + multiplierForChain(chainId), 0.9, 0.7); this.sfx(SFX.chain, 0.8); }
    if (group.length >= 10) this.sfx(SFX.whoa, 0.9);
    const dist = new Map([[origin, 0]]); const q = [origin];
    const gset = new Set(group);
    while (q.length) { const c = q.shift(); for (const n of this.grid.neighbors(c)) if (gset.has(n) && !dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); } }
    const ordered = group.slice().sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99));
    let last = origin, i = 0;
    for (const c of ordered) {
      const p = c.piece;
      if (!p || p.dead || p.chainId !== chainId) continue;
      last = c;
      this.destroyPiece(p, chainId, i++);
      await this.wait(70);
    }
    await this.wait(120);
    const lm = levelModVal(this.level);
    this.addPoints(Math.floor(basePointsForLen(group.length) * this.chainMult(chainId) * this.boomMult * lm), last, lm, chainColor);
  }
  chainMult(chainId) { return this.flatMult ? 1 : multiplierForChain(chainId); }
  // GameTurnManager::destroyPieceAtNode
  destroyPiece(p, chainId, idx = 0) {
    if (p.dead) return;
    if (p.attr === ATTR.MysteryBox && chainId && this.turn) {
      p.locked = true; this.turn.specials.add(p);
      p.anim.play('Charge', false, () => p.anim.play('Idle01', true));
      return;
    }
    if (p.attr === ATTR.Stone && p.health > 0 && !chainId) { this.damageStone(p, 1); return; }
    const cell = p.cell;
    if (this.turn && cell) (this.turn.gone = this.turn.gone || new Set()).add(cell);
    this.removePiece(p);
    p.exploding = true;
    this.ach.onDestroyed(p.attr);
    if (p.attr === ATTR.Bomb || p.attr === ATTR.MegaBomb) { this.noBombs = false; if (this.turn) this.turn.bombs++; }
    const finish = () => { p.removed = true; };
    const explode = () => {
      if (!p.anim.play('Explode', false, finish)) { this.effect('cloud', cell); finish(); }
    };
    if (!p.anim.play('Charge', false, explode)) explode();
    this.sfx(SFX.pop[idx % 2], 0.6);
    if (this.G.fx && (p.attr === ATTR.Bomb || p.attr === ATTR.MegaBomb || p.attr === ATTR.MysteryBox)) this.G.fx.spawn('chargeEffect', ...this.cellCenter(cell), { scale: p.attr === ATTR.MegaBomb ? 2 : 1 });
    if (p.attr === ATTR.Bomb || p.attr === ATTR.MegaBomb) {
      this.sfx(p.attr === ATTR.MegaBomb ? SFX.mega : SFX.bomb, 0.9);
      if (this.turn) this.turn.tasks.push(this.explodeBomb(p, cell, chainId));
    }
    if (p.attr === ATTR.Stone) this.sfx(SFX.stoneBreak, 0.8);
  }
  // GameTurnManager::checkNewChainFromNode — a bomb clears its neighbours and can start new chains
  async explodeBomb(bomb, cell, chainId) {
    await this.wait(380);
    const t = this.turn;
    const cells = this.grid.neighborsRadius(cell, bomb.attr === ATTR.MegaBomb ? 2 : 1);
    this.effect('flash', cell, { color: COLOR_TAG[bomb.color] || 'y', radius: bomb.attr === ATTR.MegaBomb ? 2 : 1 });
    let count = 0; const hit = new Set();
    for (const c of cells) {
      const q = c.piece;
      if (!q || q.dead) continue;
      if (q.attr === ATTR.Stone) { this.damageStone(q, this.rank('kPowBombM') >= 3 ? 2 : 1); continue; }
      if (q.activatedByBomb || q.locked) { hit.add(c); count++; continue; }
      if (t && t.active.has(q)) { q.activatedByBomb = true; hit.add(c); count++; continue; }
      const group = this.grid.sameColorGroup(c);
      if (group.length >= 4 && t) { t.tasks.push(this.startChain(group, c)); continue; }
      q.chainId = chainId;
      this.destroyPiece(q, chainId, count);
      hit.add(c); count++;
    }
    // cells in the blast whose piece was already cleared this turn (the bomb itself, chain mates) still count
    if (t && t.gone) for (const c of cells) if (c !== cell && t.gone.has(c) && !hit.has(c) && !(c.piece && !c.piece.dead)) count++;
    if (t && !hit.has(cell)) count++; // the bomb itself
    if (count > 0) {
      const lm = levelModVal(this.level);
      this.addPoints(Math.floor(Math.floor(basePointsForLen(count + 1) / 2) * this.chainMult(chainId) * this.boomMult * lm), cell, lm, bomb.color);
    }
  }
  damageStone(s, dmg) {
    s.health -= dmg; s.shake = 0.3;
    if (s.health <= 0) { this.destroyPiece(s, 0); return; }
    this.sfx(SFX.stoneHit, 0.8);
    if (s.cell && this.G.fx) this.G.fx.spawn('stoneHit', ...this.cellCenter(s.cell));
    s.anim.play('Idle02', true);
  }
  // GameTurnManager::handleSpecialNodes + GameManager::mysteryBoxTriggered
  async handleSpecials() {
    for (const box of this.turn.specials) {
      if (box.dead) continue;
      this.sfx(SFX.mysteryTrigger, 0.9);
      this.ach.onMystery();
      let reward = randInt(0, 4);
      if (reward === 4) reward = this.count(ATTR.Skull) < 1 ? 3 : 4;
      if (this.count(ATTR.Skull) > 0) {
        const urgent = this.pieces.find((p) => !p.dead && p.attr === ATTR.Skull && p.tick < 4);
        if (urgent) reward = rand() < 0.3 ? 3 : 4;
      }
      this.sfx(SFX.spinner, 0.6);
      await this.wait(500);
      let text;
      if (reward <= 2) { const g = [10, 20, 30][reward]; this.bonusGold += g; text = '+' + g + ' GOLD'; }
      else if (reward === 3) { this.timeFrozen = this.timeFrozen < 1 ? 2 : this.timeFrozen + 2; text = 'TIME FREEZE'; }
      else { text = 'SKULLS BEGONE'; for (const p of this.pieces) if (!p.dead && p.attr === ATTR.Skull) this.destroyPiece(p, 0); }
      this.sfx(SFX.reward[randInt(0, 2)], 0.9);
      this.showBigText(text, 1.0, 1.0);
      box.locked = false;
      this.removePiece(box); box.exploding = true;
      this.effect('cloud', box.cell);
      box.removed = true;
      await this.wait(600);
    }
  }
  addPoints(pts, cell, levelMod = 1, color = 0) {
    if (cell && cell.x !== undefined && this.G.fx && pts >= 40) this.G.fx.spawn('starEffect', ...this.cellCenter(cell));
    if (pts <= 0) return;
    this.levelPoints += pts; this.score += pts;
    // XP (GameManager::addToPendingXP): half speed early on, bonus for deeper levels
    const f = this.level < 3 ? 0.5 : this.level === 3 ? 0.75 : this.level * 0.05 + 1;
    this.xp += Math.floor((pts / levelMod) * f);
    // PlayLayer::showScore: one label per cell (points landing on the same cell merge into the old label), scoreFont2 tinted with
    // the piece colour, scale by points / levelMod (<100 .8, 100 .9, 200 1.0, 300 1.1, 400 1.2, 500+ 1.3), delayed until the chain animation ends
    if (cell && cell.x !== undefined) {
      const old = this.effects.find((e) => e.kind === 'score' && e.cell === cell && e.t < e.dur);
      let total = pts; if (old) { total += old.pts; old.t = old.dur; }
      const [x, y] = this.cellCenter(cell);
      this.effects.push({ kind: 'score', cell, pts: total, mod: levelMod, color, x, y, t: -0.26, dur: 1.2 });
    }
  }
  // GameManager::turnFinished + PlayLayer::newTurn
  async endTurn() {
    if (this.over) return;
    this.boomMult = 1; this.flatMult = false;
    if (this.tut) {
      // real timeline after the last move settles: pieces/arrow/ring fade (FadeTo 0.2 / FadeOut 0.4), the next step starts ~1.45s later
      const t = this.tut, nx = TUT_STEPS[t.i + 1];
      t.endAt = performance.now() / 1000;
      if (nx && !nx.keep) for (const p of this.pieces) this.tween(p, { alpha: 0 }, 0.2);
      await this.wait(1450); await this.tutNext(); return;
    }
    if (this.levelPoints >= this.target) { await this.levelComplete(); this.busy = false; return; }
    await this.newTurn();
  }
  async newTurn() {
    if (this.timeFrozen > 0 && !this.grid.validMoveExists()) this.timeFrozen = 0;
    if (this.timeFrozen > 0) {
      this.timeFrozen -= 1; // frozen turn: nothing ticks and nothing spawns
    } else {
      await this.updateTurnSensitive();
      if (this.skullDeath) return this.gameOver('skull');
      this.chances.increment();
      await this.spawnPieces(this.level < 4 ? 2 : 3);
    }
    if (!this.grid.validMoveExists()) return this.gameOver('moves');
    this.busy = false;
    this.saveRun(); // the game also saves when the app is closed
  }
  // PlayLayer::updateTurnSensitive + the GamePieceTicker/Spawner/Changer subclasses
  async updateTurnSensitive() {
    const snapshot = this.pieces.filter((p) => !p.dead && p.turnSensitive);
    const timedOut = [];
    for (const p of snapshot) {
      if (p.dead) continue;
      if (TICKERS.has(p.attr)) {
        p.tick = Math.max(0, p.tick - 1);
        if (p.tick === 0) timedOut.push(p);
        else if (p.attr === ATTR.Skull && p.tick <= 3) this.sfx(SFX.alert, 0.6);
      } else if (p.attr === ATTR.Pipe) {
        const free = this.grid.neighbors(p.cell).filter((c) => !c.piece);
        if (free.length) {
          const cell = free[randInt(0, free.length - 1)];
          const np = this.spawnRandomAt(cell);
          this.effect('ball', p.cell, { to: cell, color: COLOR_TAG[np.color] || 'g' });
          p.anim.play('ExitAnim', false, () => p.anim.play('Idle01', true));
          await this.wait(120);
        }
      } else if (p.attr === ATTR.Changer) {
        let c = p.color;
        for (let i = 0; i < 10 && c === p.color; i++) c = randomPieceColor(this.level);
        p.setColor(c);
        this.effect('splash', p.cell, { color: COLOR_TAG[c] });
        this.sfx(SFX.changer, 0.5);
      }
    }
    for (const p of timedOut) {
      if (p.dead) continue;
      if (p.attr === ATTR.IceBomb) {
        this.sfx(SFX.frost, 0.9);
        this.effect('iceblast', p.cell);
        for (const n of this.grid.neighbors(p.cell)) {
          const q = n.piece;
          if (q && !q.dead && q.attr !== ATTR.Stone && q.attr !== ATTR.Pipe) { q.frozen = true; q.iced = true; }
        }
        this.removePiece(p); p.exploding = true; this.effect('cloud', p.cell); p.removed = true;
        await this.wait(250);
      } else if (p.attr === ATTR.Skull) {
        this.skullDeath = p;
      } else if (p.attr === ATTR.MysteryBox) {
        this.removePiece(p); p.exploding = true; this.effect('cloud', p.cell); p.removed = true;
      }
    }
  }
  async levelComplete(skipped = false) {
    this.sfx(SFX.levelComplete, 0.9);
    this.showBigText('LEVEL COMPLETE!', 1.1, 1.2);
    if (this.G.fx) { this.G.fx.spawn('levelComplete01', W / 2, GRID_Y + 640); this.G.fx.spawn('levelComplete02', W / 2, GRID_Y + 640); }
    if (!skipped) {
      if (this.level === 1 && this.levelMoves <= 8) this.ach.report('boomlings.ach.level1Speed');
      if (this.pieces.filter((p) => !p.dead).length === 1) this.ach.report('boomlings.ach.foreveralone');
    }
    await this.wait(500);
    const alive = this.pieces.filter((p) => !p.dead);
    for (const p of alive) {
      this.removePiece(p); p.exploding = true;
      this.wait(randRange(0, 450)).then(() => {
        const finish = () => { p.removed = true; };
        if (!p.anim.play('Explode', false, finish)) { this.effect('cloud', p.cell); finish(); }
        this.sfx(SFX.pop[randInt(0, 1)], 0.4);
      });
    }
    await this.wait(900);
    await this.nextLevel();
  }
  // Called when the player dies. main.js then offers an Ankh of Life or calls finalize().
  async gameOver(reason) {
    this.over = true; this.overReason = reason;
    this.deselect();
    this.G.audio.stopMusic();
    if (reason === 'skull') {
      const s = this.skullDeath;
      this.sfx(SFX.skullDeath, 1);
      if (s && s.cell) this.effect('flash', s.cell, { color: COLOR_TAG[s.color] || 'r', radius: 3, dur: 1.2 });
      await this.wait(1200);
    } else {
      this.sfx(SFX.noMoves, 0.8);
      for (const p of this.pieces) if (!p.dead) p.shake = 1.0;
      await this.wait(1100);
    }
    this.busy = false;
    if (this.G.onDeath) this.G.onDeath(this);
  }
  // Ankh of Life: replay the current level (GameManager::restartLevel)
  async revive(armed) {
    if (!armed || this.revived) return false;
    this.revived = true; this.shortcut = true;
    this.skullDeath = null; this.over = false; this.overReason = null; this.busy = true;
    for (const p of this.pieces.slice()) { this.removePiece(p); p.removed = true; }
    this.level -= 1;
    this.G.audio.playMusic('BoomlingsLoop.mp3', 0.45);
    await this.nextLevel();
    this.busy = false;
    return true;
  }
  // GameManager::gameOver: pay gold, XP, leaderboard, stats. Returns a summary for the results screen.
  finalize() {
    if (this.summary) return this.summary;
    const sv = this.save, d = sv.d; d.run = null;
    const base = Math.round(this.score / 100) + this.bonusGold;
    const gr = this.rank('kPowGreed');
    const gold = Math.floor(base * (gr === 1 ? 1.05 : gr === 2 ? 1.1 : gr >= 3 ? 1.2 : 1));
    sv.addGold(gold);
    this.ach.onGold(sv.inc('kSGold', gold));
    // XP / rank
    const rankBefore = d.rank, xpBefore = d.xp;
    if (d.rank <= MAX_RANK - 1) {
      d.xp += this.xp;
      while (d.rank < MAX_RANK && d.xp >= requiredXP(d.rank + 1)) { d.xp -= requiredXP(d.rank + 1); d.rank++; }
    }
    this.ach.onRank(d.rank);
    // best / "Y U NO" achievement
    const prevBest = d.best;
    const newBest = this.score > prevBest;
    if (newBest) { d.best = this.score; d.loose = 0; } else { d.loose++; if (d.loose >= 3) this.ach.report('boomlings.ach.yuno'); }
    const entry = { name: d.name, score: this.score, level: this.level, icon: d.icon, rank: d.rank, date: Date.now() };
    const lbIndex = this.score > 0 ? sv.addScore(entry) : -1;
    sv.inc('games'); sv.inc('timePlayed', Math.floor(this.playTime)); sv.setMax('bestLevel', this.level);
    sv.flush();
    this.summary = { gold, base, score: this.score, level: this.level, moves: this.moves, xpGain: this.xp, rankBefore, rankAfter: d.rank, xpBefore, xpNow: d.xp, newBest, lbIndex, reason: this.overReason, prevBest };
    return this.summary;
  }
  // Quit mid-game from the pause menu counts as game over (GameManager::playerQuit keeps no reward)
  abandon() { this.G.audio.stopMusic(); this.started = false; }

  // ---- GameManager::saveGameState / loadSavedGame: the whole board and counters survive leaving to the menu ----
  serialize() {
    return {
      level: this.level, levelPoints: this.levelPoints, target: this.target, score: this.score, xp: this.xp, moves: this.moves, levelMoves: this.levelMoves,
      bonusGold: this.bonusGold, playTime: this.playTime, timeFrozen: this.timeFrozen, equipped: this.equipped.slice(), charges: { ...this.charges }, counts: { ...this.counts },
      noBombs: this.noBombs, onlyCombos: this.onlyCombos, shortcut: this.shortcut, revived: this.revived, ankh: this.ankh,
      pieces: this.pieces.filter((p) => !p.dead && !p.removed && p.cell).map((p) => ({ x: p.cell.x, y: p.cell.y, color: p.color, attr: p.attr, tick: p.tick, health: p.health, iced: p.iced, frozen: p.frozen })),
    };
  }
  saveRun() { if (this.over || !this.started || this.tut) return false; this.save.d.run = this.serialize(); this.save.flush(); return true; }
  async resumeRun(r) {
    this.reset();
    Object.assign(this, { level: r.level, levelPoints: r.levelPoints, target: r.target, score: r.score, xp: r.xp, moves: r.moves, levelMoves: r.levelMoves, bonusGold: r.bonusGold, playTime: r.playTime, timeFrozen: r.timeFrozen, equipped: r.equipped, charges: r.charges, counts: r.counts, noBombs: r.noBombs, onlyCombos: r.onlyCombos, shortcut: r.shortcut, revived: r.revived, ankh: !!r.ankh });
    this.started = true; this.G.audio.playMusic('BoomlingsLoop.mp3', 0.45);
    for (const q of r.pieces) {
      const p = this.createPiece(q.color, q.attr); p.tick = q.tick; p.health = q.health; p.iced = q.iced; p.frozen = q.frozen;
      this.counts[q.attr] = Math.max(0, (this.counts[q.attr] || 0) - 1); // createPiece counts; the saved counts are authoritative
      this.addPiece(p, this.grid.at(q.x, q.y), false);
    }
    this.counts = { ...r.counts }; this.busy = false;
  }

  // ---- tweens / effects ----
  tween(obj, to, dur, ease = (t) => t) {
    const from = {}; for (const k in to) from[k] = obj[k];
    return new Promise((res) => this.timers.push({ left: dur, tween: { obj, from, to, dur, ease }, res }));
  }
  tweenAsync(obj, to, dur) { return this.tween(obj, to, dur); }
  effect(kind, cell, extra = {}) {
    const [x, y] = this.cellCenter(cell);
    const e = { kind, x, y, t: 0, ...extra };
    if (kind === 'splash') e.dur = 6 * 0.0833;
    else if (kind === 'cloud') e.dur = 7 * 0.0833;
    else if (kind === 'flash') e.dur = extra.dur || 0.45;
    else if (kind === 'iceblast') e.dur = 0.5;
    else if (kind === 'ball') { const [tx, ty] = this.cellCenter(extra.to); e.tx = tx; e.ty = ty; e.dur = 0.3; }
    this.effects.push(e);
  }
  // Skull_w_* / Ice_w_* particle glow on ticker pieces that are about to detonate
  warnFx(p) {
    const fx = this.G.fx; if (!fx) return;
    const want = !p.dead && !p.removed && !p.exploding && (p.attr === ATTR.Skull || p.attr === ATTR.IceBomb) && p.tick <= (p.attr === ATTR.Skull ? 3 : 2);
    if (want && !p.warn) { const n = p.tick <= 1 ? '3' : p.tick <= 2 ? '2' : '1'; p.warn = fx.spawn(p.attr === ATTR.Skull ? 'Skull_w_0' + n : 'Ice_w_0' + (p.tick <= 1 ? 2 : 1), p.px, p.py, { follow: () => [p.px, p.py] }); p.warnTick = p.tick; }
    else if (p.warn && (!want || p.warnTick !== p.tick)) { p.warn.stop(); p.warn = null; }
  }
  showBigText(text, scale = 1, dur = 1.0) { this.bigText = { text, scale, t: 0, dur }; }
  sfx(name, vol = 1) { this.G.audio.play(name, vol); }

  // ---- per-frame ----
  update(dt) {
    if (this.paused) return;
    this.playTime += dt;
    for (const tm of this.timers.slice()) {
      tm.left -= dt;
      if (tm.tween) {
        const { obj, from, to, dur, ease } = tm.tween;
        const k = Math.max(0, Math.min(1, 1 - tm.left / dur));
        for (const key in to) obj[key] = from[key] + (to[key] - from[key]) * ease(k);
      }
      if (tm.left <= 0) { this.timers.splice(this.timers.indexOf(tm), 1); if (tm.tween) for (const key in tm.tween.to) tm.tween.obj[key] = tm.tween.to[key]; tm.res(); }
    }
    for (const p of this.pieces) { p.update(dt); this.warnFx(p); }
    this.pieces = this.pieces.filter((p) => !p.removed);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.dur);
    if (this.bigText) { this.bigText.t += dt; if (this.bigText.t > this.bigText.dur) this.bigText = null; }
    this.updateShop(dt);
    if (this.levelText) { this.levelText.t += dt; if (this.levelText.t > 2.0) this.levelText = null; }
    const danger = this.pieces.some((p) => !p.dead && p.attr === ATTR.Skull && p.tick <= 3);
    if (!this.over && this.started && danger !== this.danger) { this.danger = danger; this.G.audio.playMusic(danger ? 'BoomlingsDangerLoop.ogg' : 'BoomlingsLoop.mp3', 0.45); }
  }
  draw(ctx) {
    const { obj, ui, fonts } = this.G;
    // PlayLayer::createLayers: two TileBGColor strips tinted (0x72,0x4a,0x23) fill the screen behind the tiles
    // letterbox bands (colours sampled from the real game on a 480x800 screen)
    { const OYb = 53, g1 = ctx.createLinearGradient(0, -OYb, 0, 0); g1.addColorStop(0, '#223599'); g1.addColorStop(0.25, '#133386'); g1.addColorStop(0.5, '#14256c'); g1.addColorStop(0.8, '#112264'); g1.addColorStop(1, '#11184b'); ctx.fillStyle = g1; ctx.fillRect(0, -OYb, W, OYb);
      const g2 = ctx.createLinearGradient(0, H, 0, H + OYb); g2.addColorStop(0, '#112264'); g2.addColorStop(0.4, '#112155'); g2.addColorStop(1, '#061f4a'); ctx.fillStyle = g2; ctx.fillRect(0, H, W, OYb); }
    ctx.fillStyle = '#724a23'; ctx.fillRect(0, 0, W, H);
    for (const c of this.grid.cells) {
      const [x, y] = this.cellCenter(c);
      obj.draw(ctx, (c.x + c.y) % 2 ? 'TileDark01_001.png' : 'TileLight01_001.png', x, y);
      if (this.reachable.has(c)) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - CELL / 2 + 1, y - CELL / 2 + 1, CELL - 2, CELL - 2); }
    }
    if (this.path) for (const c of this.path) { const [x, y] = this.cellCenter(c); ui.draw(ctx, 'whiteDot_001.png', x, y, { alpha: 0.6, scale: 0.7 }); }
    if (this.G.fx) this.G.fx.draw(ctx, 'trail');
    const sorted = this.pieces.slice().sort((a, b) => a.py - b.py || a.id - b.id);
    for (const p of sorted) if (!p.exploding) obj.draw(ctx, 'TileShadow01_001.png', p.px, p.py + 8, { alpha: 0.22 * p.alpha, scale: 1.15 * p.scale });
    for (const p of sorted) {
      const sx = p.shake > 0 ? Math.sin(p.shake * 60) * 4 : 0;
      p.anim.draw(ctx, p.px + sx + 0.33, p.py - 2.4, { scale: p.scale, alpha: p.alpha, rot: p.rot });
      if (p.iced && !p.dead) obj.draw(ctx, 'IceOverlay_001.png', p.px + sx, p.py, { scale: 0.8 * p.scale, alpha: 0.55 * p.alpha });
      if (TICKERS.has(p.attr) && !p.dead) {
        const n = 'count_num_' + Math.min(12, p.tick) + '.png';
        if (obj.has(n)) obj.draw(ctx, n, p.px + sx + 24, p.py - 26, { scale: p.scale, alpha: p.alpha });
      }
    }
    // the selection brackets (selectOverlay) are drawn over the selected blob in the real game
    if (this.selected) { const [x, y] = this.cellCenter(this.selected); ui.draw(ctx, 'selectOverlay_001.png', x, y, { alpha: 0.9 }); }
    for (const e of this.effects) this.drawEffect(ctx, e);
    this.drawShop(ctx);
    this.drawHUD(ctx);
    this.drawTut(ctx);   // GameTutorialManager's arrow / ring / text sit above the UILayer (the real arrow overlaps the HUD bar)
    if (this.levelText) {
      const t = this.levelText.t, a = t < 0.5 ? 0 : t < 1.0 ? (t - 0.5) / 0.5 : t < 1.5 ? 1 : Math.max(0, 1 - (t - 1.5) / 0.5), lf = fonts.level;
      if (a > 0 && lf) lf.draw(ctx, this.levelText.text, 320, 384, { scale: 330 / lf.measure('LEVEL 1', 1), alpha: a });
    }
    if (this.bigText) {
      const k = this.bigText.t / this.bigText.dur;
      const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
      const s = this.bigText.scale * (1 + 0.15 * Math.sin(Math.min(1, k * 4) * Math.PI));
      fonts.big.draw(ctx, this.bigText.text, W / 2, GRID_Y + GRID * CELL / 2, { scale: s, alpha: a });
    }
  }
  // tutorial overlay: target ring, dotted path, bobbing arrow (GridArrow) and the instruction text
  drawTut(ctx) {
    const t = this.tut; if (!t || !t.step) return;
    const { ui, fonts } = this.G, st = t.step, mv = this.tutCell(st.mover), tg = this.tutCell(st.target), f = fonts.big;
    const now = performance.now() / 1000 - (t.t0 || 0), idle = !this.busy && !this.movingPiece;
    if (idle && mv && mv.piece && tg) {
      const [tx, ty] = this.cellCenter(tg), path = this.grid.findPath(mv, tg);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ui.draw(ctx, 'green_circle_001.png', tx, ty, { scale: 0.497 - 0.097 * Math.cos(2 * Math.PI * (now - 0.5) / 2.05), alpha: 225 / 255 * Math.min(1, now / 1.0) }); ctx.restore();   // CCFadeTo(1, 225) // GameTutorialManager: additive blend, opacity 225, scale pulsing 0.40..0.59 (ease in/out, 2.05s)
      if (path) {
        const pts = [this.cellCenter(mv), ...path.map((c) => this.cellCenter(c))]; let len = 0; const seg = [];
        for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); len += d; }
        const n = Math.max(2, Math.floor((len - 90) / 27));
        for (let k = 0; k <= n; k++) {
          let d = len - 45 - (n - k) * 27, i = 0; if (d < 0) continue; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
          const a = pts[i], b = pts[i + 1], u = seg[i] ? d / seg[i] : 0;
          // GridArrow::animatePath (traced): every dot loops FadeIn(0.6) + FadeOut(0.6), both CCEaseInOut(2), then DelayTime(0.2); dots start ~0.1s apart
          const ph = (((now - k * 0.1) % 1.4) + 1.4) % 1.4, ease = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
          ctx.globalAlpha = ph < 0.6 ? ease(ph / 0.6) : ph < 1.2 ? 1 - ease((ph - 0.6) / 0.6) : 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 8, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      const [mx, my] = this.cellCenter(mv); ui.draw(ctx, 'green_arrow_001.png', mx, my - 127 - 9.3 * (1 - Math.cos(2 * Math.PI * (now - 0.55) / 2.05)) / 2, { alpha: Math.min(1, now / 0.5) });   // CCFadeIn(0.5)
    }
    const sc = 413 / f.measure('Tap and slide', 1);
    const tNow = performance.now() / 1000, tin = Math.max(0, Math.min(1, ((tNow - (t.t0 || 0)) - 0.3) / 0.3)), tsc = 1;   // text: DelayTime(0.3) + FadeIn(0.3)
    (st.text || []).forEach((line, li) => {
      const [sx, sy] = st.textPos[li], cx = sx * 4 / 3, cy = (sy + 3.5 - 40) * 4 / 3, ls = line.length === 1 && line[0][0] === 'OR' ? 0.87 : 1;
      const widths = line.map(([s2]) => f.measure(s2, sc * ls)), tot = widths.reduce((a, b) => a + b, 0); let x = cx - tot / 2;
      ctx.save(); ctx.globalAlpha = tin; ctx.translate(cx, cy); ctx.scale(tsc, tsc); ctx.translate(-cx, -cy);
      line.forEach(([s2, c], i) => { (c === 'w' ? f : f.multiplied(TUT_RGB[c])).draw(ctx, s2, x, cy, { align: 'left', scale: sc * ls }); x += widths[i]; });
      ctx.restore();
    });
  }
  drawEffect(ctx, e) {
    const { obj, fonts } = this.G;
    const k = e.t / e.dur;
    if (e.kind === 'score') {
      if (e.t < 0) return;
      const v = e.pts / (e.mod || 1), tier = v >= 500 ? 1.3 : v >= 400 ? 1.2 : v >= 300 ? 1.1 : v >= 200 ? 1.0 : v >= 100 ? 0.9 : 0.8;
      const col = { 1: '#69ff69', 2: '#ff6464', 3: '#ffa63c', 4: '#64a5ff', 5: '#ff78ff', 6: '#fff03c' }[e.color] || '#ffffff';
      const t = e.t, sh = t < 0.9 ? 1 : 1 - Math.pow((t - 0.9) / 0.3, 2); // DelayTime(0.9) then ScaleTo(0.3, 0.01) + EaseIn(2), as traced
      if (sh <= 0.01) return;
      (fonts.score || fonts.big).multiplied(col).draw(ctx, String(e.pts), e.x, e.y - 8 - 29 * (t / 1.2), { scale: tier * 1.04 * sh });
      return;
    }
    const frameOf = (base, n) => base + '_' + String(1 + Math.min(n - 1, Math.floor(k * n))).padStart(3, '0') + '.png';
    if (e.kind === 'splash') { obj.draw(ctx, frameOf('Splash_' + e.color, 6), e.x, e.y, { scale: 1.1 }); return; }
    if (e.kind === 'cloud') { obj.draw(ctx, frameOf('Cloud', 7), e.x, e.y, { scale: 1.2 }); return; }
    if (e.kind === 'flash') {
      const r = (e.radius || 1) * CELL * (0.6 + 1.2 * k);
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.8 * (1 - k)) + ')'); g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
      obj.draw(ctx, frameOf('FlashEffect', 6), e.x, e.y, { scale: 1.6 * (e.radius || 1), alpha: 1 - k });
      return;
    }
    if (e.kind === 'iceblast') { obj.draw(ctx, 'IceBlast_001.png', e.x, e.y, { scale: 0.6 + 1.6 * k, alpha: 1 - k }); return; }
    if (e.kind === 'ball') { obj.draw(ctx, 'Ball_' + e.color + '_001.png', e.x + (e.tx - e.x) * k, e.y + (e.ty - e.y) * k - Math.sin(k * Math.PI) * 60, { scale: 0.8 }); }
  }
  // UILayer::init (FUN_00123b18) with the game's 320x480 y-up points converted to canvas pixels (x2, y flipped).
  drawHUD(ctx) {
    const { ui, fonts } = this.G;
    // bottom panel: bottomBG anchored bottom-centre, scaled to a 91pt height (its top is the progress bar's centre)
    const bh = ui.size('bottomBG_001.png')[1] * (182 / ui.size('bottomBG_001.png')[1]);
    // shadow the panel casts on the last board row, then the panel itself (clipped to start at the board's bottom edge)
    { const by = GRID_Y + GRID * CELL, lt = by + 10.07, g = ctx.createLinearGradient(0, lt - 11.3, 0, lt); g.addColorStop(0, 'rgba(20,10,0,0)'); g.addColorStop(1, 'rgba(20,10,0,0.7)'); ctx.fillStyle = g; ctx.fillRect(0, lt - 11.3, W, 11.3);
      ctx.save(); ctx.beginPath(); ctx.rect(0, lt, W, H - lt); ctx.clip(); ui.drawRect(ctx, 'bottomBG_001.png', 0, by - 3.56, W, H - (by - 3.56)); ctx.restore(); }
    // top bar anchored (0.5, 1) at (160, 480)
    ui.draw(ctx, 'topBar_001.png', W / 2, -0.5, { ay: 0 });
    // progress bar: frame at (160, 91); the striped fill is a child at (8, 3) of the "top" overlay
    const py = (480 - 91) * 2 + 1.67;
    ui.draw(ctx, 'pointsbar_BG_001.png', W / 2, py);
    const frac = Math.max(0, Math.min(1, this.levelPoints / this.target));
    const topW = ui.size('pointsBar_Top_001.png')[0], topH = ui.size('pointsBar_Top_001.png')[1];
    const fx = W / 2 - topW / 2 + 16, fyBottom = py + topH / 2 - 6, fh = topH * 0.93 - 8;
    if (frac > 0) {
      const maxW = topW - 32, w = Math.max(10, maxW * frac);
      ctx.save(); ctx.beginPath(); ctx.rect(fx, fyBottom - fh, w, fh); ctx.clip();
      const pat = this.G.img.pointsbar;
      for (let px = fx; px < fx + w; px += pat.width) ctx.drawImage(pat, px, fyBottom - fh, pat.width, fh);
      ctx.restore();
    }
    ui.draw(ctx, 'pointsBar_Top_001.png', W / 2, py);
    // pause button sits in the left circle at (24, 456)
    ui.draw(ctx, 'PauseBtn_001.png', 48, (480 - 456) * 2, { scale: this.pauseK || 1 });
    // counters use numbersFont: score right-aligned (anchor 1,1) at (270,463), level number top-centred at (298,464)
    const nf = fonts.numbers || fonts.gold;
    const sTop = (480 - 463) * 2;
    nf.draw(ctx, String(this.score), 540, sTop + nf.lineHeight / 2, { align: 'right', scale: 1 });
    const lv = String(this.tut ? 0 : this.level), lvScale = lv.length > 2 ? 0.6 : 0.8;
    fonts.gold.draw(ctx, lv, 133.33, 57.33, { align: 'center', scale: lvScale });
    // goldFont "extra" label (frozen turns) at (67,462), top-centred, scale 0.8
    if (this.timeFrozen > 0) fonts.gold.draw(ctx, 'x' + this.timeFrozen, 593, 47, { scale: 0.7 });
    // powerup slots in the bottom panel (MenuItemToggler: "_on" when usable, "_off" when spent)
    for (const b of this.powerButtons()) {
      const base = b.def.icon.replace('.png', '');
      const live = !b.usable || b.left > 0;
      const name = base + (live ? '_on.png' : '_off.png');
      ui.draw(ctx, ui.has(name) ? name : b.def.icon, b.x, b.y);
      if (b.usable) {
        const cn = 'count_num_' + Math.min(12, b.left) + '.png';
        if (this.G.obj.has(cn)) this.G.obj.draw(ctx, cn, b.x + b.size / 2 - 24, b.y - b.size / 2 + 22, { scale: 0.85 });
      }
    }
  }
}
