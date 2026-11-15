// Extras hub and its sub-screens, laid out from captures of the real game on a 480x800 screen
// (canvas = x*4/3, (y-40)*4/3; the design area is 640x960 drawn at OY).
import { W, H, CH, OY, ScrollArea, roundRect, richText } from './ui.js';
import { Screen, SlidePanel, btnBG, brownList, easeIO, SLIDE_T } from './screens.js';
import { TITLES } from './rules.js';

const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
const clock = (s) => pad2(s / 3600) + ':' + pad2((s / 60) % 60) + ':' + pad2(s % 60);

// ---------------------------------------------------------------- hub: icon, name, rank bar, four big labels
export class ExtrasScreen extends Screen {
  draw(ctx) {
    const { menu, ui, save } = this.G, d = save.d, f = this.f;
    this.hits.clear(); this.bg(ctx);
    this.sprite(ctx, menu, 'backArrow_001.png', 40, -9.333, 1, () => this.app.back());
    this.sprite(ctx, ui, 'shareBtn_001.png', 560, 14.667, 0.976, () => this.share());
    const ic = this.G.store.icons.find((i) => i.id === d.icon);
    this.G.icons.draw(ctx, 'boomIcon_' + String(ic ? ic.index : 0).padStart(2, '0') + '_001.png', 320, 86.667, { scale: 1.0 });
    this.hits.add(250, 20, 140, 140, () => this.app.go(new this.app.IconSelect(this.app)));
    menu.draw(ctx, 'changeNote_001.png', 500, 116.667);
    this.nameText(ctx, d.name.slice(0, 12), 320, 218.2, 1.47);
    this.hits.add(120, 170, 400, 90, () => this.app.rename());
    // rank bar
    ui.draw(ctx, 'XPBarBGBG_001.png', 320, 342.2);   // BoomXPBar node at (160, 335.56) in the original: children at x +0 / +25 / -112, label at (+25, -1)
    ui.draw(ctx, 'XPBarBG_001.png', 370, 342.2); ui.draw(ctx, 'XP_Border_001.png', 370, 342.2);
    const barW = ui.size('XPBarBG_001.png')[0] - 16, barH = ui.size('XPBarBG_001.png')[1] - 22;
    this.rankIcon(ctx, d.rank, 96, 342.2, 61);
    f.big.draw(ctx, TITLES[Math.min(TITLES.length - 1, d.rank)].toUpperCase(), 370, 344.2, { scale: 0.735 });
    const items = [['highscoresBtn_001.png', 496, () => this.app.go(new this.app.Highscores(this.app))], ['mainStatsBtn_001.png', 607.63, () => this.app.go(new StatsPanel(this.app))], ['achievementsBtn_001.png', 715.7, () => this.app.go(new AchPanel(this.app))], ['mainOptionsBtn_001.png', 820, () => this.app.go(new OptionsPanel(this.app))]];
    for (const [n, y, fn] of items) { const k = n === 'achievementsBtn_001.png' ? 0.9 : 1; const [w, h] = [menu.size(n)[0] * k, menu.size(n)[1] * k]; this.pressed(ctx, 320 - w / 2, y - h / 2, w, h, 320, y, () => menu.draw(ctx, n, 320, y, { scale: k })); this.hits.add(320 - w / 2, y - h / 2, w, h, fn); }
  }
  // player name: bigFont with a vertical orange -> yellow gradient (measured on the real game)
  nameText(ctx, text, x, y, scale) {
    const key = text + scale;
    if (this._nk !== key) {
      const c = document.createElement('canvas'); c.width = 640; c.height = 140; const t = c.getContext('2d'), y0 = y - 70;
      this.f.big.draw(t, text, x, y - y0, { scale });
      const m = document.createElement('canvas'); m.width = 640; m.height = 140; const u = m.getContext('2d'); u.drawImage(c, 0, 0);
      const g = u.createLinearGradient(0, 187.3 - y0, 0, 236 - y0); g.addColorStop(0, '#e68d2a'); g.addColorStop(1, '#ffdd44');
      u.globalCompositeOperation = 'multiply'; u.fillStyle = g; u.fillRect(0, 0, 640, 140);
      u.globalCompositeOperation = 'destination-in'; u.drawImage(c, 0, 0);
      this._nc = m; this._nk = key; this._ny = y0;
    }
    ctx.drawImage(this._nc, 0, this._ny);
  }
  share() { this.app.go(new this.app.ShareDialog(this.app, 1)); }
}

// brown list with a blue header strip (StatisticsLayer / AchievementsLayer)
class ListPanel extends SlidePanel {
  constructor(app, title) { super(app); this.title = title; this.sc = new ScrollArea(19.73, 220, 600.27, 640); this.scroll = this.sc; }
  header(ctx) {
    const { ui } = this.G, sc = this.sc;
    ui.draw(ctx, 'fullTabBG_001.png', 320, 192.7);
    this.f.big.draw(ctx, this.title, 320, 195.7, { scale: 0.64 });
    brownList(ctx, sc.x, sc.y, sc.w, sc.h, 0, 0, 6.5, 7.3);
  }
}

export class StatsPanel extends ListPanel {
  constructor(app) { super(app, 'STATISTICS'); }
  rows() {
    const sv = this.G.save, st = (k) => sv.stat(k) || 0;
    return [['Time Played:', clock(st('timePlayed'))], ['Best single move:', st('bestMove')], ['Best Chain Combo:', st('bestCombo')], ['Longest Chain:', st('longestChain')], ['Chains Detonated:', st('chains')], ['Moves Made:', st('moves')], ['Gold Collected:', st('kSGold')], ['Stones:', st('stone')], ['Skulls:', st('skull')], ['Mystery Boxes:', st('mystery')], ['Pipes:', st('pipe')], ['Mega Blobs:', st('megablob')], ['Mega Bombs:', st('megabomb')], ['Ice Bombs:', st('icebomb')], ['Bandits:', st('changer')]];
  }
  draw(ctx) {
    this.drawFrame(ctx);
    const sc = this.sc, f = this.f; this.header(ctx);
    sc.begin(ctx);
    this.rows().forEach(([k, v], i) => {
      const y = 25.33 + i * 40;
      ctx.fillStyle = i % 2 ? 'rgba(255,200,150,0.18)' : 'rgba(0,0,0,0.08)'; ctx.fillRect(0, y, sc.w, 40);
      ctx.fillStyle = '#f3a461'; ctx.fillRect(0, y, sc.w, 2);
      f.gold.draw(ctx, k, 39.7, y + 26.63, { align: 'left', scale: 0.6 });
      f.big.draw(ctx, String(v), 357.4, y + 22.7, { align: 'left', scale: 0.62 });
    });
    sc.contentH = 25.33 + 15 * 40 + 8; sc.end(ctx); sc.clamp(); this.G.ui.draw(ctx, 'blueBottomBar_001.png', 320, 880);
    this.endFrame(ctx);
  }
}

export class AchPanel extends ListPanel {
  constructor(app) { super(app, 'ACHIEVEMENTS'); this.silc = {}; }
  // locked achievements show the unlockable boomling as a flat brown silhouette
  sil(index) {
    if (this.silc[index]) return this.silc[index];
    const name = 'boomIcon_' + String(index).padStart(2, '0') + '_001.png', at = this.G.icons, f = at.frames[name];
    const c = document.createElement('canvas'); c.width = f ? f.sw : 1; c.height = f ? f.sh : 1; const x = c.getContext('2d');
    if (f) { at.draw(x, name, f.sw / 2, f.sh / 2); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgba(80,40,15,0.75)'; x.fillRect(0, 0, c.width, c.height); }
    return (this.silc[index] = c);
  }
  draw(ctx) {
    this.drawFrame(ctx);
    const sc = this.sc, f = this.f, { ach } = this.G; this.header(ctx);
    sc.begin(ctx);
    ach.list.forEach((a, i) => {
      const y = 1.33 + i * 160, done = ach.isDone(a.id);
      ctx.fillStyle = i % 2 ? 'rgba(255,200,150,0.18)' : 'rgba(0,0,0,0.08)'; ctx.fillRect(0, y, sc.w, 160);
      if (i) { ctx.fillStyle = '#f3a461'; ctx.fillRect(0, y, sc.w, 2); }
      const ic = this.G.store.icons.find((q) => q.unlockedBy === a.id);
      if (ic) { const st = this.sil(ic.index), k = 0.6; ctx.drawImage(st, 69.6 - st.width * k / 2, y + 80.3 - st.height * k / 2, st.width * k, st.height * k); }
      f.gold.draw(ctx, a.title, 131.9, y + 63.3, { align: 'left', scale: 0.71 });
      richText(ctx, f.chat, done ? a.done : a.todo, 134.6, y + 94, { scale: 1.0, maxWidth: 400, align: 'left', lineHeight: 36 });
      f.gold.draw(ctx, String(a.points), sc.w - 15, y + 31, { align: 'right', scale: 0.72 });
    });
    sc.contentH = 1.33 + ach.list.length * 160; sc.end(ctx); sc.clamp(); this.G.ui.draw(ctx, 'blueBottomBar_001.png', 320, 880);
    this.endFrame(ctx);
  }
}

export class OptionsPanel extends SlidePanel {
  constructor(app) { super(app); this.drag = null; }
  geom(i) { return { x: 113, w: 420, y: i === 0 ? 660 : 780 }; }
  draw(ctx) {
    this.drawFrame(ctx);
    const { save, ui } = this.G, f = this.f, d = save.d;
    { const g = ctx.createLinearGradient(0, 160, 0, 900); g.addColorStop(0, '#00304c'); g.addColorStop(0.35, '#003750'); g.addColorStop(1, '#001f31'); ctx.fillStyle = g; roundRect(ctx, 60, 158.7, 520, 740, 16); ctx.fill(); }
    this.button(ctx, 'Reset Tutorial', 320, 286.7, 216, 33, () => this.app.dialog('Reset Tutorial', 'Do you want to <cg>reset</c> the <cy>Tutorial</c>? All guides and hints will be reset.', [['Cancel', null], ['Yes', () => { d.tut = {}; save.flush(); }]]), { scale: 1 });
    this.button(ctx, 'Support', 320, 393, 216, 33, () => this.app.netError(), { scale: 1 });
    this.pressed(ctx, 204, 466, 232, 80, 320, 506, () => ui.draw(ctx, 'fbLogInBtn_001.png', 320, 506)); this.hits.add(204, 466, 232, 80, () => this.app.netError());
    [['Music', d.opts.mv ?? 1], ['Effects', d.opts.sv ?? 1]].forEach(([lab, v], i) => {
      const g = this.geom(i), gr = this.G.img.groove, bar = this.G.img.sliderbar, tx = g.x + (g.w - 13) * v;
      f.gold.draw(ctx, lab + ', ' + Math.round(v * 100) + '%', 320, g.y - 40, { scale: 0.79 });
      ctx.drawImage(gr, g.x, g.y - gr.height / 2);
      if (bar) { ctx.save(); ctx.beginPath(); ctx.rect(g.x + 8, g.y - bar.height / 2 + 3.3, Math.max(0, tx - g.x - 8), bar.height - 6.6); ctx.clip(); for (let px = g.x + 8; px < g.x + g.w - 8; px += bar.width) ctx.drawImage(bar, px, g.y - bar.height / 2); ctx.restore(); }
      const th = this.drag === i ? this.G.img.thumbSel : this.G.img.thumb;
      ctx.drawImage(th, tx - th.width * 0.49, g.y - th.height * 0.49, th.width * 0.98, th.height * 0.98);
      this.hits.add(g.x - 20, g.y - 40, g.w + 40, 80, null, 's' + i);
    });
    this.G.menu.draw(ctx, 'copyrightLabel_001.png', 320, 870.3);
    this.endFrame(ctx);
  }
  setS(i, x) {
    const g = this.geom(i), v = Math.max(0, Math.min(1, (x - g.x) / (g.w - 13))), o = this.G.save.d.opts;
    if (i === 0) { o.mv = v; this.G.audio.setMusicVol(v); } else { o.sv = v; this.G.audio.sv = v; }
    this.G.save.flush();
  }
  down(x, y) { const h = this.hits.hit(x, y); if (h && h.tag === 's0') { this.drag = 0; this.setS(0, x); } else if (h && h.tag === 's1') { this.drag = 1; this.setS(1, x); } else super.down(x, y); }
  move(x) { if (this.drag !== null) this.setS(this.drag, x); }
  up(x, y) { if (this.drag !== null) { this.drag = null; return; } super.up(x, y); }
}

// ---------------------------------------------------------------- IconSelectLayer: big icon + name, 4x4 grid per page
export class IconSelect extends SlidePanel {
  constructor(app) { super(app); this.page = 0; this.sel = null; this.silc = {}; }
  items() { return this.G.store.icons; }
  sil(index) {
    if (this.silc[index]) return this.silc[index];
    const name = 'boomIcon_' + String(index).padStart(2, '0') + '_001.png', at = this.G.icons, f = at.frames[name];
    const c = document.createElement('canvas'); c.width = f ? f.sw : 1; c.height = f ? f.sh : 1; const x = c.getContext('2d');
    if (f) { at.draw(x, name, f.sw / 2, f.sh / 2); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); }
    return (this.silc[index] = c);
  }
  draw(ctx) {
    this.drawFrame(ctx);
    const { save, store, ui, menu } = this.G, f = this.f, d = save.d, list = this.items(), pages = Math.ceil(list.length / 16);
    const cur = this.sel || list.find((i) => i.id === d.icon) || list[0];
    const hidden = (i) => !save.hasIcon(i.id) && i.unlockedBy;
    const bigName = hidden(cur) ? '???' : cur.title;
    if (hidden(cur)) ctx.drawImage(this.sil(cur.index), 320 - 55, 220 - 55);
    else this.G.icons.draw(ctx, 'boomIcon_' + String(cur.index).padStart(2, '0') + '_001.png', 320, 220, { scale: 1.0 });
    f.gold.draw(ctx, bigName, 320, 319.7, { scale: 1.02 });
    const g = ctx.createLinearGradient(0, 340, 0, 900); g.addColorStop(0, '#00304c'); g.addColorStop(0.35, '#003750'); g.addColorStop(1, '#001f31');
    ctx.fillStyle = g; roundRect(ctx, 60, 340, 520, 560, 16); ctx.fill();
    const xs = [179.3, 272.7, 366, 459.3], ys = [441.3, 554.3, 668.3, 781.3];
    for (let k = 0; k < 16; k++) {
      const ic = list[this.page * 16 + k]; if (!ic) break;
      const x = xs[k % 4], y = ys[Math.floor(k / 4)], own = save.hasIcon(ic.id);
      if (hidden(ic)) { { const sl = this.sil(ic.index); ctx.drawImage(sl, x - sl.width * 0.37, y - sl.height * 0.37, sl.width * 0.74, sl.height * 0.74); } ui.draw(ctx, 'questionMark_001.png', x, y, { scale: 0.8 }); }
      else {
        this.G.icons.draw(ctx, 'boomIcon_' + String(ic.index).padStart(2, '0') + '_001.png', x, y, { scale: 0.74, alpha: 1 });
        if (!own) { ui.draw(ctx, 'lock_icon_001.png', x, y + 4, { scale: 0.62 }); f.gold.draw(ctx, String(ic.price), x - 8, y + 54, { scale: 0.45 }); this.coin(ctx, x + 22, y + 54, 26); }
      }
      this.hits.add(x - 50, y - 50, 100, 100, () => { this.sel = ic; if (own) { d.icon = ic.id; save.flush(); } else if (!hidden(ic)) this.buy(ic); });
    }
    if (pages > 1) {
      this.sprite(ctx, menu, 'shopArrowL_001.png', 29, 480, 1, () => { this.page = (this.page + pages - 1) % pages; });
      this.sprite(ctx, menu, 'shopArrowR_001.png', 611, 480, 1, () => { this.page = (this.page + 1) % pages; });
    }
    f.gold.draw(ctx, String(save.gold), 581.7, -16.3, { align: 'right', scale: 0.93 }); this.coin(ctx, 611, -16.3, 49);
    this.endFrame(ctx);
  }
  buy(ic) {
    const { save, store } = this.G;
    if (save.gold < ic.price) { this.app.dialog('Not enough Gold', 'Not enough <cy>Gold Coins</c>! You need <cy>' + (ic.price - save.gold) + '</c> more.', [['OK', null]]); return; }
    this.app.dialog('Confirm Purchase', 'Purchase <cg>' + ic.title + '</c> for ' + ic.price + ' <cy>Gold Coins</c>?', [['CANCEL', null], ['OK', () => { const r = store.buyIcon(ic); if (r.ok) { this.G.audio.play('buyGold001.ogg', 0.8); save.d.icon = ic.id; save.flush(); } }]]);
  }
}

// ---------------------------------------------------------------- "Continue?" panel shown by Play when a saved game exists
export class ContinuePanel extends Screen {
  constructor(app) { super(app); this.under = app.top(); this.tIn = 0; this.closing = false; }
  update(dt) { super.update(dt); this.tIn += dt; if (this.closing && this.tIn > SLIDE_T) { this.app.back(); if (this.after) this.after(); } }
  close(after) { if (!this.closing) { this.closing = true; this.tIn = 0; this.after = after; } }
  draw(ctx) {
    const f = this.f, { ui } = this.G;
    this.under && this.under.draw(ctx);
    const k = this.closing ? 1 - easeIO(this.tIn / SLIDE_T) : easeIO(this.tIn / SLIDE_T), dk = Math.min(1, this.tIn / SLIDE_T), dim = this.closing ? 1 - dk : dk;
    ctx.fillStyle = 'rgba(0,10,40,' + (0.55 * dim) + ')'; ctx.fillRect(0, -OY, W, CH);
    this.hits.clear();
    ctx.save(); ctx.translate(0, (1 - k) * 1066.7);
    ui.draw(ctx, 'pauseBG_001.png', 320, 16 + 924 / 2 + 159.33);
    f.gold.draw(ctx, 'Continue?', 322.33, 340, { scale: 1.08 });
    { const g = ctx.createLinearGradient(0, 369.4, 0, 590.8); g.addColorStop(0, '#002a49'); g.addColorStop(1, '#003c55'); ctx.fillStyle = g; } roundRect(ctx, 40, 369.4, 560, 221.4, 16); ctx.fill();
    richText(ctx, f.chat, 'Do you want to <cg>resume</c> your saved\ngame or start a new game?\nStarting a <cy>new</c> game will <cr>remove</c> any\nsave data.', 319.33, 418.33, { scale: 1.0, maxWidth: 580, align: 'center', lineHeight: 40 });
    this.button(ctx, 'Resume Game', 320, 664, 216, 33, () => this.close(() => this.app.beginGame(1, true)), { scale: 1 });
    this.button(ctx, 'New Game', 320, 770.7, 216, 33, () => this.close(() => { this.G.save.d.run = null; this.G.save.flush(); this.app.startFlow(); }), { scale: 1 });
    this.button(ctx, 'Cancel', 320, 876.63, 216, 33, () => this.close(), { scale: 1 });
    ctx.restore();
  }
}
