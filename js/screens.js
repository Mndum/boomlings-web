// Menu screens rebuilt from the decompiled layer code. The game lays everything out in a 320x480 y-up point
// space; here every coordinate is converted with PX/PY to the 640x960 y-down canvas.
import { W, H, CH, OY, Hits, ScrollArea, roundRect, richText } from './ui.js';
import { nineSlice } from './atlas.js';
import { TITLES } from './rules.js';
import { requiredXP, MAX_RANK } from './game.js';
import { Animator } from './anim.js';

export const PX = (x) => x * 2;
export const PY = (y) => (480 - y) * 2;
const iconFrame = (i) => 'boomIcon_' + String(i).padStart(2, '0') + '_001.png';
const rankFrame = (r) => 'LevelIcon_' + String(Math.max(1, Math.min(25, r))).padStart(3, '0') + '.png';
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtTime = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + 'h ' : '') + m + 'm ' + (s % 60) + 's'; };
const rankTitle = (r) => TITLES[Math.min(TITLES.length - 1, r)];
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
// cocos2d CCEaseInOut(rate 2) as used by SlideInLayer::showLayer/hideLayer (measured on the real game: ~0.5s, symmetric)
export const easeIO = (t) => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 0.5 * Math.pow(2 * t, 2) : 1 - 0.5 * Math.pow(2 * (1 - t), 2); };
export const SLIDE_T = 0.5;

// ButtonSprite background: buttonBG2 (80px source) as a scale-9 sprite drawn at half size, so corners are ~14px
export function btnBG(ctx, img, x, y, w, h, alpha = 1) {
  nineSlice(ctx, img, x, y, w, h, 28, alpha);
}

// cocos2d CCEaseBounceOut
export const bounceOut = (t) => { if (t < 1 / 2.75) return 7.5625 * t * t; if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; } if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; } t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375; };
const hkey = (x, y, w, h) => Math.round(x + w / 2) + ',' + Math.round(y + h / 2);

export class Screen {
  constructor(app) { this.app = app; this.G = app.G; this.hits = new Hits(); this.scroll = null; this.pd = null; this.t = 0; }
  get f() { return this.G.fonts; }
  update(dt) { this.t += dt; }
  bg(ctx) { this.G.menu.draw(ctx, 'MainMenuBG_001.png', W / 2, H / 2, { scale: CH / H }); }
  blankBg(ctx) { const a = this.G.start; a.draw(ctx, 'BlankBG_001.png', W / 2, H / 2, { scale: Math.max(W / a.size('BlankBG_001.png')[0], CH / a.size('BlankBG_001.png')[1]) }); }
  panel(ctx, x, y, w, h) { this.G.menu.nine(ctx, 'shopTopBG_001.png', x, y, w, h, 36); }
  panel2(ctx, x, y, w, h) { this.G.menu.nine(ctx, 'shopBottomBG_001.png', x, y, w, h, 36); }
  rankIcon(ctx, rank, x, y, size = 100) { const n = rankFrame(rank), f = this.G.ui.frames[n]; if (!f) return; const k = size / Math.max(f.w, f.h); this.G.ui.drawRect(ctx, n, x - f.w * k / 2, y - f.h * k / 2, f.w * k, f.h * k); }
  boomIcon(ctx, id, x, y, scale = 0.7, alpha = 1) { const ic = this.G.store.icons.find((i) => i.id === id); this.G.icons.draw(ctx, iconFrame(ic ? ic.index : 0), x, y, { scale, alpha }); }
  coin(ctx, x, y, s = 36) { const c = this.G.coin; if (c) ctx.drawImage(c, x - s / 2, y - s / 2, s, s); }
  sprite(ctx, atlas, name, x, y, scale, fn, o = {}) {
    const [w, h] = atlas.size(name), k = fn ? this.pscale(x - (w * scale) / 2, y - (h * scale) / 2, w * scale, h * scale) : 1;
    atlas.draw(ctx, name, x, y, { scale: scale * k, alpha: o.alpha, ax: o.ax, ay: o.ay });
    if (fn) this.hits.add(x - (w * scale) / 2, y - (h * scale) / 2, w * scale, h * scale, fn);
  }
  // ButtonSprite: buttonBG2 scale9 with goldFont text; width/height in points
  button(ctx, text, cx, cy, wpt, hpt, fn, o = {}) {
    const w = wpt * 2, h = (hpt || 40) * 2, pk = fn && !o.disabled ? this.pscale(cx - w / 2, cy - h / 2, w, h) : 1;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pk, pk); ctx.translate(-cx, -cy);
    btnBG(ctx, this.G.img.btn, cx - w / 2, cy - h / 2, w, h, o.disabled ? 0.5 : 1);
    this.f.gold.draw(ctx, text, cx, cy + 8, { scale: o.scale ?? 0.8, alpha: o.disabled ? 0.6 : 1 });
    ctx.restore();
    if (fn && !o.disabled) this.hits.add(cx - w / 2, cy - h / 2, w, h, fn);
  }
  // CCMenuItemSpriteExtra (traced on the real game): pressing runs CCEaseBounceOut(CCScaleTo 0.3s -> 1.26), releasing CCEaseBounceOut(CCScaleTo 0.4s -> 1.0)
  pscale(x, y, w, h) {
    const a = this.pa && this.pa[hkey(x, y, w, h)]; if (!a) return 1;
    return a.from + (a.to - a.from) * bounceOut(Math.min(1, (performance.now() - a.t0) / a.dur));
  }
  // draw fn() scaled around (cx, cy) by the press animation of the hit rect (x, y, w, h)
  pressed(ctx, x, y, w, h, cx, cy, fn) { const k = this.pscale(x, y, w, h); ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); fn(); ctx.restore(); }
  pressTo(key, to) { this.pa = this.pa || {}; const a = this.pa[key], cur = a ? a.from + (a.to - a.from) * bounceOut(Math.min(1, (performance.now() - a.t0) / a.dur)) : 1; this.pa[key] = { from: cur, to, t0: performance.now(), dur: to > 1 ? 300 : 400 }; }
  down(x, y) { this.pd = this.hits.hit(x, y); if (this.pd && this.pd.fn && this.pd.press !== false) { this.pk = hkey(this.pd.x, this.pd.y, this.pd.w, this.pd.h); this.pressTo(this.pk, 1.26); } if (this.scroll) this.scroll.down(x, y); }
  move(x, y) { if (this.scroll) this.scroll.move(x, y); }
  up(x, y) {
    if (this.pk) { this.pressTo(this.pk, 1); this.pk = null; }
    let tap = true; if (this.scroll) tap = this.scroll.up();
    const h = this.hits.hit(x, y);
    if (tap && h && this.pd && h.x === this.pd.x && h.y === this.pd.y && h.w === this.pd.w && h.fn) { this.G.audio.play('click07.ogg', 0.6); h.fn(); }
    this.pd = null;
  }
  wheel(dy) { if (this.scroll) this.scroll.wheel(dy); }
  rowHit(x, y, w, h, fn) { const sy = y + this.scroll.y - this.scroll.off; this.hits.add(x + this.scroll.x, sy, w, h, fn, null, this.scroll); }
}

// ---------------------------------------------------------------- main menu (MenuLayer::init + setupMenuButtons)
export class MenuScreen extends Screen {
  constructor(app) {
    super(app);
    this.blocks = ['r', 'g', 'b', 'y'].map((c, i) => { const a = new Animator(app.G.libXL, 'xl_Block_' + c); a.acc = i * 0.4; return a; });
    this.spark = Array.from({ length: 14 }, () => ({ x: Math.random() * 640, y: 80 + Math.random() * 120, t: Math.random() * 3 }));
  }
  update(dt) { super.update(dt); for (const b of this.blocks) b.update(dt); }
  draw(ctx) {
    const { menu, ui } = this.G;
    this.hits.clear();
    menu.draw(ctx, 'MainMenuBG_001.png', W / 2, H / 2, { scale: CH / H });
    if (this.G.fx) this.G.fx.draw(ctx, 'menu'); // glitter sits behind the logo
    menu.draw(ctx, 'boomlingslogo.png', 320, 66.667);
    // vertical menu: Play / Store / Extras / Free Gold. Positions are the original game's own values, read from the running game with Frida:
    // the menu node sits at (160, 266.667) in its 320x533.33 layer, labels at x +14.5 / +30.5 / +36.5 / +41 and y +87.333 / +25.111 / -36.111 / -92.333,
    // the boomling blocks at x -80. canvas px = (2x, 1013.333 - 2y) for original layer coordinates (x, y)
    const items = [['mainPlayBtn_001.png', () => this.app.startFlow()], ['mainStoreBtn_001.png', () => this.app.go(new ShopScreen(this.app))], ['mainExtrasBtn_001.png', () => this.app.go(new this.app.Extras(this.app))], ['freeGoldBtn_001.png', () => this.app.go(new this.app.FreeGold(this.app))]];
    const ys = [305.333, 429.778, 552.222, 664.667], lxs = [349, 381, 393, 402];
    items.forEach(([name, fn], i) => {
      const [wpx, hpx] = menu.size(name), cx = lxs[i], cy = ys[i];
      const press = this.pscale(cx - wpx / 2, cy - hpx / 2, wpx, hpx);
      menu.draw(ctx, name, cx, cy, { scale: press });
      this.hits.add(cx - wpx / 2, cy - hpx / 2, wpx, hpx, fn, i);
      this.blocks[i].draw(ctx, 160, cy, { scale: 0.9 });
      this.hits.add(160 - 60, cy - 60, 120, 120, fn, 10 + i);
    });
    // glitter around the logo (glitterEffect.plist)
    if (this.G.fx && (!this.glit || this.glit.dead)) this.glit = this.G.fx.spawn('glitterEffect', 320, 66.667, { layer: 'menu', alive: () => this.app.top() === this });
    // the small buttons, original values (layer x, y): daily (275, 413.333), rate (290, 30) + label (240.994, 30), robtop (60, 30), hello (136, 20),
    // feedback button (30, 80) + label (88, 70), more games (280, 80)
    // the daily button's sprite pulses forever: CCEaseInOut(CCScaleTo 0.5s -> 1.05), CCEaseInOut(CCScaleTo 0.5s -> 0.95), ease rate 2 (the sequence restarts from 0.95)
    const [dw, dh] = ui.size('dailyBtn_001.png'), dk = this.pscale(550 - dw / 2, 186.667 - dh / 2, dw, dh);
    const ease = (u) => (u < 0.5 ? 0.5 * Math.pow(2 * u, 2) : 1 - 0.5 * Math.pow(2 - 2 * u, 2));
    const pt = this.t < 1 ? this.t : (this.t - 1) % 1, p0 = this.t < 1 ? 1 : 0.95;
    const pulse = pt < 0.5 ? p0 + (1.05 - p0) * ease(pt / 0.5) : 1.05 + (0.95 - 1.05) * ease((pt - 0.5) / 0.5);
    ui.draw(ctx, 'dailyBtn_001.png', 550, 186.667, { scale: dk * pulse });
    this.hits.add(550 - dw / 2, 186.667 - dh / 2, dw, dh, () => this.app.claimDaily());
    // MenuLayer::onRobTop -> CCApplication::openURL("http://www.robtopgames.com")
    this.sprite(ctx, menu, 'robtoplogo_small.png', 120, 953.333, 1, () => { try { window.open('http://www.robtopgames.com', '_blank', 'noopener'); } catch (e) { /* popup blocked */ } });
    menu.draw(ctx, 'hello_001.png', 272, 973.333);
    this.sprite(ctx, menu, 'feedbackBtn_001.png', 60, 853.333, 1, () => { try { location.href = 'mailto:feedback@boomlings.com'; } catch (e) { /* no mail handler */ } }   // MenuLayer::onFeedback -> GameSocialManager::sendMail(..., "feedback@boomlings.com")
    );
    menu.draw(ctx, 'feedback_001.png', 176, 873.333);
    const mg = this.G.img.more; ctx.drawImage(mg, 560 - mg.width / 2, 853.333 - mg.height / 2);
    this.hits.add(560 - mg.width / 2, 853.333 - mg.height / 2, mg.width, mg.height, () => this.app.dialog('More Games', 'More games from RobTop need an internet connection.', [['OK', null]]));
    // the rate label slides 5 points right and back forever: CCRepeatForever(CCSequence(CCEaseInOut(CCMoveBy(1s, (5,0)), 2), its reverse)), starting from rateBtn.x - 54 = 236 (MenuLayer::init)
    { const ph = this.t % 2, u = ph < 1 ? ph : 2 - ph; menu.draw(ctx, 'rate_001.png', 2 * (236 + 5 * ease(u)), 953.333); }
    // MenuLayer::onRate -> AppDelegate::openAppPage; the offline build's page-opener does nothing visible, so the button only presses
    this.sprite(ctx, menu, 'rateBtn_001.png', 580, 953.333, 1, () => {});
    const nm = this.G.save.d.name.toUpperCase().slice(0, 12);
    if (this.G.save.d.name !== 'Player') this.f.gold.draw(ctx, nm, 273 + menu.size('hello_001.png')[0] / 2 + 10, 976, { align: 'left', scale: 0.55 });
    this.hits.add(200, 940, 330, 70, () => this.app.rename());
  }
}

// ---------------------------------------------------------------- generic slide-in panel (SlideInLayer)
export class SlidePanel extends Screen {
  constructor(app) { super(app); this.under = app.top(); this.tIn = 0; this.closing = false; }
  update(dt) { super.update(dt); this.tIn += dt; if (this.closing && this.tIn > SLIDE_T) this.app.back(); }
  close() { if (!this.closing) { this.closing = true; this.tIn = 0; } }
  k() { return this.closing ? 1 - easeIO(this.tIn / SLIDE_T) : easeIO(this.tIn / SLIDE_T); }
  dimK() { const u = Math.min(1, this.tIn / SLIDE_T); return this.closing ? 1 - u : u; } // CCFadeTo on the layer colour: linear
  drawFrame(ctx) {
    this.bg(ctx); // the real panel replaces the screen: only the menu backdrop shows around it
    const k = this.k();
    ctx.fillStyle = 'rgba(0,10,40,' + (0.62 * this.dimK()) + ')'; ctx.fillRect(0, -OY, W, CH);
    this.hits.clear();
    ctx.save(); ctx.translate(0, (1 - k) * 1066.7);
    this.G.ui.draw(ctx, 'pauseBG_001.png', 320, 16 + 924 / 2 + 19.6);
    this.sprite(ctx, this.G.ui, 'playBtn_001.png', 320, 60, 0.852, () => this.close());
    this.sprite(ctx, this.G.menu, 'backArrow_001.png', 40, -13, 1, () => this.close());
    this.G.ui.draw(ctx, 'shareBtn_001.png', 560.67, 14, { alpha: 0.5 });
  }
  endFrame(ctx) { ctx.restore(); }
}

// ---------------------------------------------------------------- Extras: highscores / stats / achievements (BoomHighscoreList)
// Leaderboard list background (HighscoreLayer): tan body, thin orange rim along the sides and top, soft inner shadow.
// the leaderboard's waiting spinner (loadingCircle tinted cream, as measured on the real game)
let _spin = null;
export function spinnerImg(G) {
  const img = G.img.loading; if (!img) return null;
  if (_spin) return _spin;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgb(255,245,201)'; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
  return (_spin = c);
}
export function brownList(ctx, x, y, w, h, gx0 = 0, gx1 = 0, rim = 3, topRim = 4.5) {
  ctx.save();
  ctx.fillStyle = '#a1582c'; ctx.fillRect(x, y, w, h);
  const sh = (x0, y0, x1, y1, rx, ry, rw, rh, a = 0.5) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(70,30,8,' + a + ')'); g.addColorStop(1, 'rgba(70,30,8,0)'); ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh); };
  sh(x, 0, x + 24, 0, x, y, 24, h); sh(x + w, 0, x + w - 24, 0, x + w - 24, y, 24, h);
  sh(0, y, 0, y + 26, x, y, w, 26); sh(0, y + h, 0, y + h - 13, x, y + h - 13, w, 13, 0.1);
  ctx.fillStyle = '#ffb571'; ctx.fillRect(x, y, rim, h); ctx.fillRect(x + w - rim, y, rim, h);
  // thin top rim, open under the active tab
  ctx.fillRect(x, y - 1, Math.max(0, gx0 - x), topRim); ctx.fillRect(Math.max(gx1, x), y - 1, Math.max(0, x + w - Math.max(gx1, x)), topRim);
  ctx.restore();
}

export class ExtrasPanel extends SlidePanel {
  constructor(app, tab = 'friends') { super(app); this.tab = tab === 'stats' ? 'global' : tab; this.scroll = new ScrollArea(PX(10) + 6, PY(366), PX(300) - 12, 590); }
  draw(ctx) {
    this.drawFrame(ctx);
    const { ui, menu } = this.G;
    // back arrow (top-left) and Share button (top-right), as in HighscoreLayer
    // brown list area (the real leaderboard background) framed by the dark panel
    const sc = this.scroll; sc.x = 19.73; sc.y = 220; sc.w = 600.27; sc.h = 640; // same width as the tab strip // list butts directly against the tab row
    // tab row: trophy / global / friends / local. All tabs sit BEHIND the list, whose top rim runs over their feet
    // (the rim has a gap under the active tab).
    const tabs = [['ach', 'topTab', 80], ['global', 'globalTab', 176], ['friends', 'friendsTab', 176], ['local', 'localTab', 176]];
    const place = []; { let t = 16; for (const [k, n, w] of tabs) { place.push({ k, n, w, x: t }); t += w; } }
    const drawTab = (e, dx) => { const on = this.tab === e.k; this.sprite(ctx, ui, e.n + (on ? '_on' : '') + '_001.png', e.x + e.w / 2 + dx, 193.6, 1, () => { this.tab = e.k; this.scroll.off = 0; this.lb = undefined; }); };
    place.forEach((e, ti) => drawTab(e, [2.67, 0.67, -1, -2.67][ti])); // every tab, selected or not, sits behind the list
    const act = place.find((e) => e.k === this.tab);
    brownList(ctx, sc.x, sc.y, sc.w, sc.h, 0, 0, 6.5, 7.3);
    sc.begin(ctx);
    if (this.tab === 'local') this.drawLocal(ctx, sc);
    else if (this.tab === 'global' && this.G.api && this.G.api.online) this.drawOnline(ctx, sc);
    else if (this.tab === 'global' || this.tab === 'ach') this.drawSpinner(ctx, sc);
    else if (this.tab === 'friends') this.drawFriends(ctx, sc);
    else this.drawSpinner(ctx, sc);
    sc.end(ctx); sc.clamp(); sc.scrollbar(ctx);
    ui.draw(ctx, 'blueBottomBar_001.png', 320, 880);
    // plain dark panel under the bar (the panel art's lighter lower glow is not part of the real leaderboard)
    const by = 880 + 40, gr = ctx.createLinearGradient(0, by, 0, H);
    gr.addColorStop(0, '#07294f'); gr.addColorStop(1, '#031a38'); ctx.fillStyle = gr; ctx.fillRect(34, by, W - 68, H - by);
    ui.draw(ctx, 'blueBottomBar_001.png', 320, 880);
    this.endFrame(ctx);
  }
  share() {
    const d = this.G.save.d, txt = 'I scored ' + fmt(d.best) + ' points in Boomlings! (rank ' + d.rank + ')';
    try { navigator.clipboard.writeText(txt); this.app.toast('Score copied', txt); } catch (e) { this.app.toast('Share', txt); }
  }
  // Global and all-time tabs wait for the server forever when there is no connection: a spinning loadingCircle
  drawSpinner(ctx, sc) {
    const img = spinnerImg(this.G); if (!img) return;
    ctx.save(); ctx.translate(sc.w / 2, 540 - sc.y); ctx.rotate(this.t * 5.2); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
    sc.contentH = sc.h;
  }
  drawGlobal(ctx, sc) {
    this.f.gold.draw(ctx, 'GLOBAL SCORES NEED', sc.w / 2, 44, { scale: 0.62 });
    this.f.gold.draw(ctx, 'AN INTERNET CONNECTION', sc.w / 2, 90, { scale: 0.62 });
    this.f.chat.draw(ctx, 'Your stats', sc.w / 2, 150, { scale: 0.7 });
    this.drawStats(ctx, sc, 180);
  }
  drawFriends(ctx, sc) {
    richText(ctx, this.f.gold, 'Login to Facebook to compare scores with friends.', 105.7, 215, { scale: 0.79, maxWidth: 400, lineHeight: 48.7 });
    const bx = 300.33, by = 373.63;
    ctx.save(); ctx.translate(0, 0); this.G.ui.draw(ctx, 'fbLogInBtn_001.png', bx, by);
    this.rowHit(bx - 116, by - 40, 232, 80, () => this.app.dialog('Offline', 'Facebook is not available in the offline version of the game.', [['OK', null]]));
    ctx.restore();
    sc.contentH = sc.h;
  }
  // global tab, when the backend is there: the Worker's leaderboard (level first, then score)
  drawOnline(ctx, sc) {
    const api = this.G.api;
    if (this.lb === undefined || this.lbTab !== this.tab) { this.lbTab = this.tab; this.lb = null; api.leaderboard().then((j) => { this.lb = j; }).catch(() => { this.lb = false; }); }
    if (this.lb === null) return this.drawSpinner(ctx, sc);
    if (this.lb === false) { this.f.gold.draw(ctx, 'COULD NOT LOAD', sc.w / 2, 300, { scale: 0.62 }); sc.contentH = sc.h; return; }
    const list = this.lb.entries, me = api.user && api.user.name;
    if (!list.length) this.f.gold.draw(ctx, 'NO SCORES YET', sc.w / 2, 300, { scale: 0.62 });
    list.forEach((e, i) => highscoreRow(this, ctx, { ...e, icon: e.icon || 'kIcon_001' }, i, 4 + i * 80, sc.w, i % 2 ? 0.14 : 0.0, !!me && e.name === me));
    sc.contentH = Math.max(sc.h, 4 + list.length * 80);
  }
  drawLocal(ctx, sc) {
    const list = this.G.save.d.scores;
    list.forEach((e, i) => highscoreRow(this, ctx, e, i, 4 + i * 80, sc.w, i % 2 ? 0.14 : 0.0));
    sc.contentH = 4 + list.length * 80;
  }
  drawStats(ctx, sc, y0 = 4) {
    const sv = this.G.save, d = sv.d;
    const rows = [['Games played', fmt(sv.stat('games'))], ['Best score', fmt(d.best)], ['Highest level', sv.stat('bestLevel')], ['Moves made', fmt(sv.stat('moves'))], ['Time played', fmtTime(sv.stat('timePlayed'))], ['Gold collected', fmt(sv.stat('kSGold'))], ['Chains detonated', fmt(sv.stat('chains'))], ['Longest chain', sv.stat('longestChain') + ' pieces'], ['Skulls destroyed', fmt(sv.stat('skull'))], ['Stones destroyed', fmt(sv.stat('stone'))], ['Bandits destroyed', fmt(sv.stat('changer'))], ['Mega Bombs detonated', fmt(sv.stat('megabomb'))], ['Mega Blobs popped', fmt(sv.stat('megablob'))], ['Mystery Boxes opened', fmt(sv.stat('mystery'))], ['Powerups used', fmt(sv.stat('powersUsed'))], ['Icons collected', d.icons.length + ' / ' + this.G.store.icons.length], ['Achievements', this.G.ach.list.filter((a) => this.G.ach.isDone(a.id)).length + ' / ' + this.G.ach.list.length]];
    rows.forEach(([k, v], i) => {
      const y = y0 + i * 80;
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.05)'; ctx.fillRect(0, y, sc.w, 80);
      this.f.chat.draw(ctx, k, 16, y + 40, { align: 'left', scale: 0.8 });
      this.f.gold.draw(ctx, String(v), sc.w - 16, y + 40, { align: 'right', scale: 0.7 });
    });
    sc.contentH = y0 + rows.length * 80;
  }
  drawAch(ctx, sc) {
    const { ach, ui } = this.G;
    this.f.gold.draw(ctx, ach.totalPoints + ' / ' + ach.maxPoints + ' POINTS', sc.w / 2, 24, { scale: 0.6 });
    ach.list.forEach((a, k) => {
      const y = 50 + k * 112, done = ach.isDone(a.id), pct = ach.percent(a.id);
      nineSlice(ctx, this.G.img.sq03, 0, y, sc.w, 104, 40, 1);
      if (!done) { ctx.fillStyle = 'rgba(8,20,50,0.55)'; roundRect(ctx, 6, y + 6, sc.w - 12, 92, 20); ctx.fill(); }
      ui.draw(ctx, 'star_001.png', 44, y + 40, { scale: 1.3, alpha: done ? 1 : 0.35 });
      this.f.gold.draw(ctx, a.title.toUpperCase(), 84, y + 24, { align: 'left', scale: 0.44, alpha: done ? 1 : 0.85 });
      richText(ctx, this.f.chat, done ? a.done : a.todo, 84, y + 52, { scale: 0.44, maxWidth: 420, lineHeight: 19, alpha: done ? 1 : 0.85 });
      this.f.chat.draw(ctx, a.points + ' pts', sc.w - 16, y + 24, { align: 'right', scale: 0.5 });
      if (!done) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(ctx, 84, y + 82, 320, 12, 6); ctx.fill(); if (pct > 0) { ctx.fillStyle = '#ffa31a'; roundRect(ctx, 84, y + 82, Math.max(12, 320 * pct / 100), 12, 6); ctx.fill(); } this.f.chat.draw(ctx, pct + '%', 412, y + 88, { align: 'left', scale: 0.4 }); }
      else ui.draw(ctx, 'okBtn_001.png', sc.w - 40, y + 70, { scale: 0.26 });
    });
    sc.contentH = 50 + ach.list.length * 112;
  }
}

// One leaderboard cell (HighscoreCell::loadFromItem): rank#, icon, name, Level/score, rank mascot (300x40pt cell).
export function highscoreRow(scr, ctx, e, i, y, w, shade = 0.05, hl = false) {
  const f = scr.f;
  ctx.fillStyle = hl ? 'rgba(255,220,80,0.25)' : 'rgba(255,255,255,' + shade + ')'; ctx.fillRect(0, y, w, 80);
  const num = String(i + 1), sc = Math.min(0.8, 40 / Math.max(1, f.gold.measure(num, 1)));
  f.gold.draw(ctx, num, 44, y + 40, { scale: Math.max(0.45, sc), align: 'center' });
  scr.boomIcon(ctx, e.icon, 114, y + 40, 0.5);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px Helvetica, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(String(e.name).slice(0, 12), 168, y + 40);
  f.gold.draw(ctx, 'Level ' + e.level, 360, y + 28, { align: 'left', scale: 0.6 });
  f.gold.draw(ctx, fmt(e.score), 360, y + 56, { align: 'left', scale: 0.5 });
  scr.rankIcon(ctx, e.rank || 1, w - 44, y + 40, 52);
}

// ---------------------------------------------------------------- pre-game powerup selection (PowerupSelectLayer)
const PG_T = 0.96;
export class PowerSelectScreen extends Screen {
  // PowerupSelectLayer: three SlotMenuItems on top, PowerupPages (4 PowerupMenuItems each) below, tap once to select, tap again to unlock / add
  constructor(app) {
    super(app); this.sel = null; this.armed = false; this.startLevel = 1; this.page = 0; this.px = 0; this.msg = null;
    this.order = ['kPowBOOM', 'kPowTimeFreeze', 'kPowBombM', 'kPowColorM', 'kPowGreed', 'kPowSkullBlast', 'kPowTimeBoost', 'kPowLevelSkip'];
    setTimeout(() => app.tutorial('pow01', 'tutorial_pow01_001'), 400);
  }
  pows() { return this.order.map((t) => this.G.store.pow(t)).filter(Boolean); }
  update(dt) {
    super.update(dt); if (this.lblT != null) this.lblT += dt; const to = -this.page * 640;
    // BoomScrollLayer::moveToPage: CCMoveTo wrapped in CCEaseElasticOut
    if (this.pgTo !== to) { this.pgTo = to; this.pgFrom = this.px; this.pgT = 0; }
    if (this.pgT < PG_T) { this.pgT = Math.min(PG_T, this.pgT + dt); this.px = this.pgFrom + (to - this.pgFrom) * Dialog.elastic(this.pgT / PG_T, 0.3); } else this.px = to;
  }
  draw(ctx) {
    const { store, save, ui, menu } = this.G, d = save.d, f = this.f;
    this.hits.clear(); this.blankBg(ctx);
    menu.draw(ctx, 'shopBottomBG_001.png', PX(160), PY(350), { scaleX: 1.14, scaleY: 0.74 });
    menu.draw(ctx, 'shopTopBG_001.png', PX(160), PY(155), { scaleX: 1.14, scaleY: 1.35 });
    // positions are the original game's own values (Frida scene dump): canvas px = (2x, 1013.333 - 2y) for layer coordinates (x, y)
    menu.draw(ctx, 'SelPowBar_001.png', 320, 130);
    this.sprite(ctx, menu, 'backArrow_001.png', 40, -9.333, 1, () => this.app.back());
    const g = String(save.gold | 0);   // the original's counter label shows plain digits (no thousands separator)
    this.coin(ctx, 609.4, -20, 66); f.gold.draw(ctx, g, 582, -9.333, { align: 'right', scale: 1 });
    menu.draw(ctx, 'yourGold_001.png', 419, -21.333, { ax: 1 });   // right-aligned at x=209.5
    // slots
    for (let i = 0; i < 3; i++) {
      const x = [160, 318, 476][i], y = 253.333, tag = d.equipped[i];
      menu.draw(ctx, 'slotBG' + (i + 1) + '_001.png', x, y);
      if (tag && i < d.slots) { const ic = store.pow(tag).ranks[Math.max(0, save.powRank(tag) - 1)].icon.replace('.png', '_on.png'); ui.draw(ctx, ic, x, y, { scale: 0.62 }); }
      this.hits.add(x - 55, y - 55, 110, 110, () => { this.G.audio.play('click08.ogg', 0.6); if (tag) { d.equipped[i] = null; save.flush(); } });
    }
    // info line: "Choose Powerups Here" until something is selected, then TAP AGAIN TO ...
    const sp = this.sel && store.pow(this.sel), r = sp && save.powRank(sp.tag), on = sp && d.equipped.includes(sp.tag);
    if (!sp || on) menu.draw(ctx, 'choosePow_001.png', 320, 392);
    else { const u = this.lblT == null ? 1 : this.lblT, k = u < 0.09 ? 1 + 0.06 * (u / 0.09) : u < 0.29 ? 1.06 - 0.06 * Dialog.elastic((u - 0.09) / 0.2, 0.3) : 1; f.gold.draw(ctx, r ? 'TAP AGAIN TO ADD' : 'TAP AGAIN TO UNLOCK', 320, 396, { scale: 0.7 * k }); }
    // description
    if (sp) {
      const def = sp.ranks[Math.max(0, (r || 1) - 1)];
      f.gold.draw(ctx, def.title, 59.7, 637, { align: 'left', scale: 0.8 });
      richText(ctx, f.chat, def.desc.replace(/\n/g, ' '), 59.9, 668.7, { align: 'left', scale: 1, maxWidth: 570, lineHeight: 36 });
    } else {
      f.gold.draw(ctx, 'Powerup', 59.7, 637, { align: 'left', scale: 0.8 });
      richText(ctx, f.chat, 'Tap a <cg>Powerup</c> for more info!', 59.9, 668.7, { align: 'left', scale: 1.018, maxWidth: 570, lineHeight: 36 });
    }
    // pages
    ctx.save(); ctx.translate(this.px, 0);
    this.pows().forEach((p, k) => {
      const pg = Math.floor(k / 4), col = k % 4, x = 126 + col * 128 + pg * 640, y = 500, owned = save.powRank(p.tag), eq = d.equipped.includes(p.tag), selected = this.sel === p.tag;
      const rk = p.ranks[Math.max(0, owned - 1)], icon = eq ? rk.icon.replace('.png', '_off.png') : selected ? rk.icon.replace('.png', '_on.png') : rk.icon;
      ui.draw(ctx, icon, x, y);
      if (!owned) {
        ui.draw(ctx, 'lock_icon_001.png', x + (col ? 33.66 : 33.33), y - 32.4, { scale: 0.69 });
        this.price(ctx, p.ranks[0].price, x, 570.7);
      } else if (owned < p.ranks.length) this.price(ctx, p.ranks[owned].price, x, 570.7, true);
      this.hits.add(x + this.px - 60, y - 60, 120, 120, () => this.tapPow(p));
    });
    ctx.restore();
    this.sprite(ctx, menu, 'shopArrowL_001.png', 26, 496, 1, () => { this.page = Math.max(0, this.page - 1); });
    this.sprite(ctx, menu, 'shopArrowR_001.png', 614, 496, 1, () => { this.page = Math.min(1, this.page + 1); });
    this.sprite(ctx, menu, 'playBtn_001.png', 320, 892, 0.9, () => this.app.beginGame(this.startLevel));
  }
  // PriceLabel: goldFont number then a coin
  price(ctx, n, x, y, up) {
    const f = this.f.gold, s = 0.7, w = f.measure(String(n), s), cw = 44, tot = w + cw, x0 = x - tot / 2 + 4;
    f.draw(ctx, String(n), x0 + 2.6, y + 2.7, { align: 'left', scale: s }); this.coin(ctx, x0 + w + cw / 2 - 3, y - 4.4, cw);
  }
  tapPow(p) {
    const { save, store } = this.G, d = save.d, r = save.powRank(p.tag);
    this.G.audio.play('click08.ogg', 0.6); this.lblT = 0;
    if (this.sel !== p.tag) { this.sel = p.tag; return; }
    if (d.equipped.includes(p.tag)) { d.equipped[d.equipped.indexOf(p.tag)] = null; save.flush(); return; }
    if (!r) {
      const rk = p.ranks[0], price = rk.price;
      this.app.go(new ConfirmPurchase(this.app, { title: rk.title, icon: rk.icon, desc: rk.desc.replace(/\n/g, ' '), price }, 'Buy', save.gold >= price, () => {
        const res = store.buyPow(p.tag, 1);
        if (res.ok) this.G.audio.play('buyGold001.ogg', 0.8); else this.app.toast('Powerup', res.msg);
      }));
      return;
    }
    const free = d.equipped.findIndex((t, i) => i < d.slots && !t);
    if (free >= 0) { d.equipped[free] = p.tag; save.flush(); } else this.app.toast(d.slots === 0 ? 'No powerup slots' : 'All slots are full', d.slots === 0 ? 'Buy a slot in the Store first.' : 'Tap an equipped slot to free it.');
  }
}

// ---------------------------------------------------------------- store (GameShopLayer): one item per page, tabs along the bottom
// traced on the real game: GameShopLayer drops in with CCEaseBounceOut(CCMoveTo 1.0s) and leaves with CCEaseInOut(CCMoveTo 0.7s, rate 2)
const SHOP_DROP_T = 1.0, SHOP_CLOSE_T = 0.7, SHOP_CLOSE_POP = 0.7;
export class ShopScreen extends Screen {
  constructor(app, tab = 'pow') { super(app); this.tab = tab; this.page = {}; this.drag = null; this.pos = 0; this.dropT = 0; }
  items() {
    const { store, save } = this.G, d = save.d, out = [];
    const nl = String.fromCharCode(10);
    if (this.tab === 'items') for (const it of store.items.filter((i) => (({ kItemSkip: 5, kItemSkipB: 10, kItemSkipC: 15 })[i.feature] || 0) <= (save.stat('maxLevel') || 0))) { const m = /x(\d+)/.exec(it.title); out.push({ kind: 'item', title: it.title, desc: it.desc, icon: it.icon, price: it.price, have: d.items[it.feature] || 0, count: m ? m[1] : 0, buy: () => this.buy(it.title, it.price, () => store.buyItem(it)) }); }
    else if (this.tab === 'pow') {
      for (const p of store.pows) {
        const own = save.powRank(p.tag), next = p.ranks[own], shown = next || p.ranks[own - 1];
        out.push({ kind: 'pow', title: shown.title, desc: shown.desc.split(nl).join(' '), icon: shown.icon, rankIcons: p.ranks.map((r) => r.icon), rank: own, price: next ? next.price : 0, owned: !next, buy: () => this.buy(next.title, next.price, () => store.buyPow(p.tag, own + 1)) });
      }
      for (const s2 of store.slotDefs) { const own = d.slots >= s2.n, ready = d.slots === s2.n - 1; out.push({ kind: 'slot', n: s2.n, title: s2.title, desc: 'Powerup slot ' + s2.n + '. Equip more powerups at the start of each game.', price: s2.price, owned: own, locked: !own && !ready ? 'Buy the previous slot first.' : null, buy: () => this.buy(s2.title, s2.price, () => store.buySlot(s2.n)) }); }
    } else if (this.tab === 'icons') for (const ic of store.icons) {
      const own = save.hasIcon(ic.id), a2 = ic.unlockedBy && this.G.ach.byId[ic.unlockedBy];
      out.push({ kind: 'icon', id: ic.id, boom: ic.index, title: ic.title, desc: ic.desc.split(nl).join(' '), price: ic.price, owned: own, selected: d.icon === ic.id, locked: !own && ic.unlockedBy ? 'Unlocked by <cy>' + (a2 ? a2.title : 'achievement') + '</c>' : null, buy: () => this.buy(ic.title, ic.price, () => store.buyIcon(ic)) });
    }
    else if (this.tab === 'iap' && this.G.api && this.G.api.online && this.G.api.packs) Object.entries(this.G.api.packs).forEach(([pack, gold], i) => out.push({ kind: 'iap', title: fmt(gold) + ' Gold', desc: 'A pile of <cy>Gold Coins</c> for the Store. <cg>Free</c>, one pack every <cy>3 days</c>.', art: 'IAPGold0' + (i + 1) + '_001.png', price: 0, owned: false, buy: () => this.getPack(pack, gold) }));
    return out;
  }
  getPack(pack, gold) {
    const api = this.G.api;
    if (!api.signedIn) { this.app.account(); return; }
    const w = api.iapWait();
    if (w > 0) { this.app.dialog('Come back later', 'You can claim free gold <cy>once every 3 days</c>. Next pack in <cg>' + (w >= 86400 ? Math.floor(w / 86400) + ' d ' + Math.floor((w % 86400) / 3600) + ' h' : Math.floor(w / 3600) + ' h ' + Math.ceil((w % 3600) / 60) + ' min') + '</c>.', [['OK', null]]); return; }
    api.buyPack(pack).then((g) => this.app.dialog('Gold Reward!', 'You have been rewarded <cg>' + fmt(g) + '</c> <cy>Gold Coins</c>!', [['OK', null]])).catch((e) => this.app.dialog('Error', e.message, [['OK', null]]));
  }
  setTab(t) {
    if (t === 'exit') { if (this.closeT === undefined) this.closeT = 0; return; }
    this.tab = t; this.pos = this.page[t] || 0; if (t === 'icons') this.app.tutorial('icon', 'tutorial_icon');
  }
  // BoomScrollLayer::moveToPage: MoveTo over 1.2 x (0.4 fast / 0.6 medium / 0.8 slow) seconds with CCEaseElasticOut
  update(dt) {
    super.update(dt);
    if (this.dropT < SHOP_DROP_T) this.dropT += dt;
    if (this.closeT !== undefined) { this.closeT += dt; if (this.closeT >= SHOP_CLOSE_POP) this.app.back(); return; }
    if (this.drag) { this.anim = null; return; }
    const tgt = this.page[this.tab] || 0;
    if (this.pos === undefined) this.pos = tgt;
    if (!this.anim && Math.abs(this.pos - tgt) > 1e-4) this.anim = { from: this.pos, to: tgt, t: 0, dur: 1.2 * (this.flick ?? 0.8) };
    if (this.anim && this.anim.to !== tgt) this.anim = { from: this.pos, to: tgt, t: 0, dur: 1.2 * (this.flick ?? 0.8) };
    if (this.anim) {
      const a = this.anim; a.t += dt; const u = Math.min(1, a.t / a.dur), pp = 0.5;   // CCEaseElasticOut(period 0.5) as traced
      const e = u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u - pp / 4) * (2 * Math.PI) / pp) + 1;
      this.pos = a.from + (a.to - a.from) * e;
      if (u >= 1) { this.pos = a.to; this.anim = null; this.flick = null; }
    }
  }
  // GameShopLayer (positions measured from the real game on a 480x800 screen; canvas = x*4/3, (y-40)*4/3)
  // the shop layer drops in from above the screen with CCEaseBounceOut (measured ~0.85s, full screen travel); the old screen stays underneath
  draw(ctx) {
    if (this.dropT >= SHOP_DROP_T && this.closeT === undefined) return this.drawBody(ctx);
    const below = this.app.stack[this.app.stack.indexOf(this) - 1];
    if (below) below.draw(ctx);
    // exit (measured): the layer slides up off the screen, EaseInOut rate 2 over ~0.68s (gone from view after ~0.55s), no fade
    const off = this.closeT !== undefined ? easeIO(Math.min(1, this.closeT / SHOP_CLOSE_T)) * 1066.7 * -1 : -(1 - bounceOut(this.dropT / SHOP_DROP_T)) * 1066.7;
    ctx.save(); ctx.translate(0, off); this.drawBody(ctx); ctx.restore();
  }
  drawBody(ctx) {
    const { menu, save } = this.G;
    this.hits.clear(); this.bg(ctx);
    const items = this.items(), n = items.length;
    if (this.pos === undefined) this.pos = this.page[this.tab] || 0;
    const wrap = n >= 3, pgRaw = this.page[this.tab] || 0, pg = wrap ? pgRaw : Math.max(0, Math.min(n - 1, pgRaw)); this.page[this.tab] = pg;
    const SP = 541, pick = (i) => items[((i % n) + n) % n];
    for (let i = Math.floor(this.pos) - 1; i <= Math.ceil(this.pos) + 1; i++) { if (!wrap && (i < 0 || i > n - 1)) continue; this.drawItem(ctx, pick(i), (i - this.pos) * SP, i === pg); }
    // header: title banner (left) and gold counter (right)
    menu.draw(ctx, 'shopTabBG_001.png', 168.7, -1.7);
    if (this.tab === 'iap') { const bf = this.G.fonts.big; bf.draw(ctx, 'IAP', 168.7, -6.7 + 6, { scale: 80 / bf.measure('IAP', 1) }); if (!n) this.f.gold.draw(ctx, 'Billing not supported', 320, 480.7, { scale: 440 / this.f.gold.measure('Billing not supported', 1) }); }
    else menu.draw(ctx, { items: 'tabLabelItems_001.png', pow: 'tabLabelPow_001.png', icons: 'tabLabelIcons_001.png' }[this.tab], 168.7, -6.7);
    menu.draw(ctx, 'goldBg_001.png', 505, -4);
    const g = String(save.gold | 0); this.f.gold.draw(ctx, g, 575, 1.67, { align: 'right', scale: 0.8 }); this.coin(ctx, 596, -7, 49);
    if (n > 1 || this.tab === 'iap') {
      this.sprite(ctx, menu, 'shopArrowL_001.png', 31.7, 480, 1, () => { this.page[this.tab] = wrap ? pg - 1 : Math.max(0, pg - 1); });
      this.sprite(ctx, menu, 'shopArrowR_001.png', 608.3, 480, 1, () => { this.page[this.tab] = wrap ? pg + 1 : Math.min(n - 1, pg + 1); });
    }
    const tabs = [['pow', 'powTabBtn', 76], ['items', 'itemTabBtn', 197], ['icons', 'iconTabBtn', 320], ['iap', 'iapTabBtn', 441], ['exit', 'exitTabBtn', 564]];
    for (const [k, b, x] of tabs) this.sprite(ctx, menu, b + (this.tab === k ? '_on' : '') + '_001.png', x, 944, 1, () => this.setTab(k));
  }
  btnLabel(ctx, text, cx, cy, w, fn, dim) {
    btnBG(ctx, this.G.img.btn, cx - w / 2, cy - 32, w, 64);
    const f = dim ? this.f.gold.tinted('#8a6d20') : this.f.gold;
    f.draw(ctx, text, cx, cy + 6, { scale: Math.min(0.81, (w - 16) / this.f.gold.measure(text, 1)) });
    if (fn) this.hits.add(cx - w / 2, cy - 30, w, 60, fn);
  }
  drawItem(ctx, e, dx, active) {
    const { menu, ui } = this.G, f = this.f, X = (v) => v + dx, hit = active && Math.abs(dx) < 4;
    menu.draw(ctx, 'shopTopBG_001.png', X(320), 300);
    menu.draw(ctx, 'shopBottomBG_001.png', X(320), 640);
    const ic = (name, cx, cy, size, alpha = 1) => { const [w, h] = ui.size(name); ui.draw(ctx, name, cx, cy, { scale: size / Math.max(w, h), alpha }); };
    if (e.kind === 'pow') {
      for (let q = 0; q < e.rankIcons.length; q++) { const off = e.rankIcons[q].replace('.png', '_off.png'); ic(ui.has(off) ? off : e.rankIcons[q], X(111 + q * 64.5), 171, 62, 1); }
      ic(e.icon, X(320), 267.7, 146, 1);
    } else if (e.kind === 'iap') menu.draw(ctx, e.art, X(320), 271, { scale: 1.0 });
    else if (e.kind === 'slot') menu.draw(ctx, 'slotBG' + e.n + '_001.png', X(320), 269, { scale: 1.2 });
    else if (e.kind === 'icon') this.G.icons.draw(ctx, iconFrame(e.boom), X(320), 271, { scale: 1.0, alpha: 1 });
    else { ic(e.icon, X(320), 269, 139); if (e.count) f.gold.draw(ctx, 'x' + e.count, X(357), 233, { scale: 0.8 }); }
    if (e.kind === 'item') f.gold.draw(ctx, String(e.have), X(89.3), 179, { align: 'left', scale: 0.99 });
    if (e.kind !== 'slot' && !e.owned && e.kind !== 'item' && e.kind !== 'iap') ui.draw(ctx, 'lock_icon_001.png', X(349), 243, { scale: 0.75 });
    // ShopItemLayer::updateItemButton shows the Free Gold gem only while the player cannot afford the price (the button then reads "Buy Gold");
    // ShopItemLayer::onFreeGold -> showTapJoyOffers, which the offline build turns into Offline.claim("offers", 10 min) -> awardGold(25)
    if (e.kind !== 'icon' && !e.owned && e.price > this.G.save.gold) { const fg = ui.has('freeBtn_001.png') ? 'freeBtn_001.png' : null; if (fg) { ui.draw(ctx, fg, X(500), 189); if (hit) this.hits.add(440, 130, 120, 110, () => { if (this.G.store.claimOffline('offers', 600000)) this.G.save.addGold(25); else this.app.dialog('Unavailable', 'No offers right now. Check back in 10 minutes!', [['OK', null]]); }); } }
    // price / state + button
    if (e.kind === 'icon' && e.owned) this.btnLabel(ctx, e.selected ? 'Selected' : 'Select', X(320), 413, e.selected ? 213 : 187, hit && !e.selected ? () => { this.G.save.d.icon = e.id; this.G.save.flush(); } : null, e.selected);
    else if (e.kind === 'iap') { f.gold.draw(ctx, 'FREE', 320, 362, { scale: 0.95 }); { const w = this.G.api.signedIn ? this.G.api.iapWait() : 0, hrs = Math.floor(w / 3600), lab = !this.G.api.signedIn ? 'Sign in' : w > 0 ? (w >= 86400 ? Math.floor(w / 86400) + 'd ' + Math.floor((w % 86400) / 3600) + 'h' : hrs ? hrs + 'h ' + Math.ceil((w % 3600) / 60) + 'm' : Math.ceil(w / 60) + ' min') : 'Get Gold'; this.btnLabel(ctx, lab, X(320), 418.4, 213, hit ? () => e.buy() : null, w > 0); } }
    else if (e.owned) this.btnLabel(ctx, e.kind === 'pow' ? 'Maxed' : 'Owned', X(320), 413, 187, null, true);
    else if (e.locked) richText(ctx, f.chat, e.locked, X(320), 395, { scale: 1.0, maxWidth: 420, align: 'center', lineHeight: 40 });
    else {
      { const num = String(e.price), nw = f.gold.measure(num, 0.81), gx = 322.5 - (nw + 37.4) / 2; f.gold.draw(ctx, num, X(gx), 362, { align: 'left', scale: 0.81 }); this.coin(ctx, X(gx + nw + 18), 354.7, 56); }
      this.btnLabel(ctx, 'Buy Gold', X(320), 418.4, 213, hit ? () => e.buy() : null);
    }
    // description panel
    f.gold.draw(ctx, e.title, X(98.3), 555, { align: 'left', scale: 0.8 });
    richText(ctx, f.chat, e.desc, X(98), 590.7, { scale: 1.0, maxWidth: 440 * 1, align: 'left', lineHeight: 40 });
  }
  buy(name, price, fn) {
    if (this.G.save.gold < price) { this.app.dialog('Not enough Gold', 'Not enough <cy>Gold Coins</c>! You need <cy>' + fmt(price - this.G.save.gold) + '</c> more. Earn gold by playing games.', [['OK', null]]); return; }
    this.app.dialog('Confirm Purchase', 'Purchase <cg>' + name + '</c> for ' + fmt(price) + ' <cy>Gold Coins</c>?', [['YES', () => { const r = fn(); if (r.ok) { this.G.audio.play('buyGold001.ogg', 0.8); this.app.toast('Purchased!', name); } else this.app.toast('Oops', r.msg); }], ['NO', null]]);
  }
  down(x, y) { this.drag = { x, p: this.pos, t: performance.now() }; this.dragMoved = false; this.anim = null; super.down(x, y); }
  move(x) { if (!this.drag) return; const dx = x - this.drag.x; if (Math.abs(dx) > 12) this.dragMoved = true; if (this.dragMoved) this.pos = this.drag.p - dx / 541; }
  up(x, y) {
    const d = this.drag; this.drag = null;
    const n = this.items().length;
    if (d && this.dragMoved) {
      const cur = d.p, r = Math.round(this.pos + (this.pos - cur) * 0.5), t = n >= 3 ? r : Math.max(0, Math.min(n - 1, r));
      const v = Math.abs(this.pos - cur) * 541 / Math.max(1, performance.now() - d.t); // px per ms
      this.flick = v > 1.0 ? 0.4 : v > 0.5 ? 0.6 : 0.8; this.page[this.tab] = t; this.pd = null; return;
    }
    super.up(x, y);
  }
}

// ---------------------------------------------------------------- options (name, icon, reset) as a slide-in panel
export class OptionsPanel extends SlidePanel {
  draw(ctx) {
    this.drawFrame(ctx);
    const { save, menu } = this.G, d = save.d;
    menu.draw(ctx, 'mainOptionsBtn_001.png', 320, PY(400), { scale: 0.9 });
    this.f.gold.draw(ctx, 'PLAYER NAME', 320, PY(345), { scale: 0.55 });
    this.button(ctx, d.name.toUpperCase().slice(0, 14), 320, PY(310), 200, 40, () => this.app.rename());
    this.f.gold.draw(ctx, 'ICON', 320, PY(262), { scale: 0.55 });
    this.boomIcon(ctx, d.icon, 220, PY(222), 0.8);
    this.button(ctx, 'Choose Icon', 380, PY(222), 120, 40, () => this.app.go(new ShopScreen(this.app, 'icons')));
    this.button(ctx, 'Reset Progress', 320, PY(150), 160, 40, () => this.app.dialog('Reset progress?', 'This erases your <cy>gold</c>, <cg>powerups</c>, <cg>icons</c>, achievements, statistics and highscores. It cannot be undone.', [['RESET', () => { save.reset(); this.app.toast('Progress reset', 'Starting fresh.'); }], ['CANCEL', null]]));
    richText(ctx, this.f.chat, 'All data is stored in this browser only.', 320, PY(95), { scale: 0.5, maxWidth: 440, align: 'center' });
    this.endFrame(ctx);
  }
}

// ---------------------------------------------------------------- FLAlertLayer
export class Dialog extends Screen {
  // net = a request to the (gone) game servers: LoadingCircle first (dim + spinner, ~0.3s), then the "Error" alert pops in
  constructor(app, title, msg, buttons, net = false) { super(app); this.titleText = title; this.msg = msg; this.buttons = buttons; this.under = app.top(); this.tIn = 0; this.net = net; this.netT = net ? 0.3 : 0; }
  update(dt) { super.update(dt); this.tIn += dt; }
  // CCEaseElasticOut(period 0.5) over 0.5s, from scale 0 (fitted to the real FLAlertLayer pop-in)
  static elastic(u, p = 0.5) { if (u <= 0) return 0; if (u >= 1) return 1; return Math.pow(2, -10 * u) * Math.sin((u - p / 4) * 2 * Math.PI / p) + 1; }
  draw(ctx) {
    if (this.under) this.under.draw(ctx);
    const td = Math.max(0, this.tIn - this.netT);
    if (this.net && this.tIn < 0.52) {
      // LoadingCircle layer: dim ramps to ~0.45 and a translucent ring spins in the middle of the screen
      ctx.fillStyle = 'rgba(0,0,0,' + (0.45 * Math.min(1, this.tIn / 0.3) * Math.min(1, (0.54 - this.tIn) / 0.07)) + ')'; ctx.fillRect(0, -OY, W, CH);
      const img = spinnerImg(this.G);
      if (img) { ctx.save(); ctx.globalAlpha = 0.55 * Math.min(1, this.tIn / 0.2); ctx.translate(320, 486); ctx.rotate(this.tIn * 7); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore(); }
    }
    ctx.fillStyle = 'rgba(0,0,0,' + (0.59 * Math.min(1, this.net ? td / 0.25 : this.tIn / 0.14)) + ')'; ctx.fillRect(0, -OY, W, CH);
    this.hits.clear();
    if (this.net && td <= 0) return;
    const k = Dialog.elastic(td / 0.5, 0.6); // CCEaseElasticOut(period 0.6) over 0.5s from scale 0 (least-squares fit to the real pop-in)
    this.drawBox(ctx, k);
  }
  drawBox(ctx, k) {
    // FLAlertLayer measured from the real game: 495x274.7 box centred on the screen
    const w = 495, h = 274.7, cx = 320, cy = 480;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    nineSlice(ctx, this.G.img.sq01, cx - w / 2, cy - h / 2 - 1.8, w, h, 56);
    this.f.gold.draw(ctx, this.titleText, cx, cy - 74, { scale: 0.9 });
    richText(ctx, this.f.chat, this.msg, cx - 1.3, cy - 30.3, { scale: 0.99, maxWidth: 440, align: 'center', lineHeight: 40 });
    const sc = 0.8, ws = this.buttons.map(([l]) => Math.max(109, this.f.gold.measure(l, sc) + 33)), gap = 33, tot = ws.reduce((a, b2) => a + b2, 0) + gap * (ws.length - 1);
    let bx = cx - tot / 2; const by = cy + 81.3;
    this.buttons.forEach(([label, fn], i) => {
      const bw = ws[i];
      this.pressed(ctx, bx, by - 30, bw, 61, bx + bw / 2, by, () => {
        btnBG(ctx, this.G.img.btn, bx, by - 30, bw, 61);
        this.f.gold.draw(ctx, label, bx + bw / 2, by + 6, { scale: Math.min(1, (bw - 36) / this.f.gold.measure(label, 1)) });
      });
      const x0 = bx; this.hits.add(x0, by - 30, bw, 61, () => { this.app.back(); if (fn) fn(); });
      bx += bw + gap;
    });
    ctx.restore();
  }
}

// ConfirmPurchaseLayer (FLAlertLayer subclass): banner title, item icon + price, dark description box, Cancel / Buy buttons
export class ConfirmPurchase extends Dialog {
  constructor(app, item, buyLabel, afford, onBuy) { super(app, item.title, '', [], false); this.item = item; this.buyLabel = buyLabel; this.afford = afford; this.onBuy = onBuy; }
  drawBox(ctx, k) {
    const { ui, menu } = this.G, f = this.f, it = this.item, cx = 320, cy = 480;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    nineSlice(ctx, this.G.img.sq01, cx - 273.5, cy - 297.5, 547, 595, 56);
    { const bm = menu.bitmap('shopTabBG_001.png'), sy = 1.18, cap = 70, dw = 490, dh = bm.height * sy, dx = 320 - dw / 2, dy = 180 - dh / 2;
      ctx.drawImage(bm, 0, 0, cap, bm.height, dx, dy, cap * sy, dh); ctx.drawImage(bm, cap, 0, bm.width - 2 * cap, bm.height, dx + cap * sy, dy, dw - 2 * cap * sy, dh); ctx.drawImage(bm, bm.width - cap, 0, cap, bm.height, dx + dw - cap * sy, dy, cap * sy, dh); }
    this.G.fonts.big.draw(ctx, it.title.toUpperCase(), 320, 190, { scale: Math.min(0.91, 400 / this.G.fonts.big.measure(it.title.toUpperCase(), 1)) });
    if (it.sil) { ctx.drawImage(it.sil, 320 - it.sil.width * 0.5, 328 - it.sil.height * 0.5); ui.draw(ctx, 'questionMark_001.png', 320, 328, { scale: 0.9 }); }
    else if (it.boom !== undefined) this.G.icons.draw(ctx, 'boomIcon_' + String(it.boom).padStart(2, '0') + '_001.png', 320, 328, { scale: 1.07 });
    else { const [iw, ih] = ui.size(it.icon); ui.draw(ctx, it.icon, 320, 320, { scale: 144 / Math.max(iw, ih) }); }
    if (it.hidden) {   // achievement-locked icon: no price, "Unlocked by Achievement <name>" and an OK check
      ctx.fillStyle = '#04111d'; roundRect(ctx, 69.3, 440, 501.4, 220, 16); ctx.fill();
      f.gold.draw(ctx, it.title, 320, 476, { scale: 0.8 });
      richText(ctx, f.chat, it.desc, 82.7, 513, { scale: 1.0, maxWidth: 480, align: 'left', lineHeight: 40 });
      f.gold.draw(ctx, 'Unlocked by Achievement', 320, 689, { scale: 0.6 }); f.gold.draw(ctx, it.ach, 320, 721, { scale: 0.7 });
      this.hits.clear(); const n = 'okBtn_001.png', sh = menu.frames && menu.frames[n] ? menu : ui, [w, h] = sh.size(n), hx = (520 - w / 2) * k + cx - cx * k, hy = (780 - h / 2) * k + cy - cy * k;
      this.pressed(ctx, hx, hy, w * k, h * k, 520, 780, () => sh.draw(ctx, n, 520, 780, {})); this.hits.add(hx, hy, w * k, h * k, () => this.app.back());
      ctx.restore(); return;
    }
    { const num = String(it.price), nw = f.gold.measure(num, 0.81), gx = 320 - (nw + 37.4) / 2 - 4; f.gold.draw(ctx, num, gx, 410, { align: 'left', scale: 0.81 }); this.coin(ctx, gx + nw + 18, 402, 50); }
    ctx.fillStyle = '#04111d'; roundRect(ctx, 69.3, 440, 501.4, 220, 16); ctx.fill();
    f.gold.draw(ctx, it.title, 320, 476, { scale: 0.8 });
    richText(ctx, f.chat, it.desc, 82.7, 513, { scale: 1.0, maxWidth: 480, align: 'left', lineHeight: 40 });
    this.hits.clear();
    const bw = 208, bh = 64, by = 718;
    [['Cancel', 197.3, () => { this.app.back(); }], [this.afford ? this.buyLabel : 'Buy Gold', 437.3, () => { this.app.back(); if (this.afford) this.onBuy(); else this.app.go(new ShopScreen(this.app, 'iap')); }]].forEach(([label, bx, fn]) => {
      const hx = (bx - bw / 2 - 20) * k + cx - cx * k, hy = (by - bh / 2) * k + cy - cy * k, hw = (bw + 40) * k, hh = bh * k;
      this.pressed(ctx, hx, hy, hw, hh, bx, by, () => {
        btnBG(ctx, this.G.img.btn, bx - bw / 2, by - bh / 2, bw, bh);
        f.gold.draw(ctx, label, bx, by + 7, { scale: Math.min(0.9, (bw - 36) / f.gold.measure(label, 1)) });
      });
      this.hits.add(hx, hy, hw, hh, fn);
    });
    ctx.restore();
  }
  coin(ctx, x, y, s) { const c = this.G.coin; if (c) ctx.drawImage(c, x - s / 2, y - s / 2, s, s); }
}


// ShareLayer (FLAlertLayer subclass): banner, dark message box with rank icon, Facebook / Facebook request / mail buttons, OK check
export class ShareDialog extends ConfirmPurchase {
  constructor(app, kind = 1, level = 1) { super(app, { title: kind === 1 ? 'Share Rank' : 'Share Score' }, '', true, null); this.kind = kind; this.level = level; }
  message() {
    const d = this.G.save.d, nl = String.fromCharCode(10);
    if (this.kind === 1) return { text: 'I am a <cg>rank ' + d.rank + '</c>' + nl + '<cy>' + TITLES[Math.min(TITLES.length - 1, d.rank)] + '</c>', plain: 'I am a rank ' + d.rank + ' ' + TITLES[Math.min(TITLES.length - 1, d.rank)] + ' in Boomlings!' };
    return { text: 'You reached' + nl + '<cy>Level ' + this.level + '</c>', plain: 'I reached level ' + this.level + ' in Boomlings!' };
  }
  share() { const m = this.message().plain; try { navigator.clipboard.writeText(m); } catch (e) { /* no clipboard */ } this.app.toast('Copied', m); }
  drawBox(ctx, k) {
    const { ui, menu } = this.G, f = this.f, cx = 320, cy = 480, m = this.message();
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    nineSlice(ctx, this.G.img.sq01, cx - 280, cy - 295.9, 560.7, 597, 56);
    { const bm = menu.bitmap('shopTabBG_001.png'), sy = 1.0, cap = 70, dw = 480, dh = bm.height * sy, dx = 323.3 - dw / 2, dy = 183 - dh / 2;
      ctx.drawImage(bm, 0, 0, cap, bm.height, dx, dy, cap * sy, dh); ctx.drawImage(bm, cap, 0, bm.width - 2 * cap, bm.height, dx + cap * sy, dy, dw - 2 * cap * sy, dh); ctx.drawImage(bm, bm.width - cap, 0, cap, bm.height, dx + dw - cap * sy, dy, cap * sy, dh); }
    const T = this.item.title; this.G.fonts.big.draw(ctx, T, 320.4, 179.3, { scale: 349.3 / this.G.fonts.big.measure(T, 1) });
    ctx.fillStyle = '#001529'; roundRect(ctx, 75.3, 240.3, 492, 292, 16); ctx.fill();
    m.text.split(String.fromCharCode(10)).forEach((ln, i) => richText(ctx, this.G.fonts.big, ln, 320 + (i ? -1.0 : -13.6), i ? 337.7 : 277.6, { scale: 1.0, maxWidth: 500, align: 'center', lineHeight: 60, mult: true }));
    if (this.kind === 1) this.rankIcon(ctx, this.G.save.d.rank, 320.3, 453, 64);
    else { const ic = this.G.store.icons.find((i) => i.id === this.G.save.d.icon), n = 'boomIcon_' + String(ic ? ic.index : 0).padStart(2, '0') + '_001.png', [iw] = this.G.icons.size(n); this.G.icons.draw(ctx, n, 320.3, 453, { scale: iw ? 124 / iw : 1 }); }
    this.hits.clear();
    const sheet = (n) => (menu.frames && menu.frames[n] ? menu : ui);
    [['facebookSBtn_001.png', 137.7], ['facebookReqSBtn_001.png', 320], ['mailSBtn_001.png', 502.3]].forEach(([n, x], i) => {
      const sh = sheet(n), [w, h] = sh.size(n), hx = (x - w / 2) * k + cx - cx * k, hy = (620 - h / 2) * k + cy - cy * k;
      this.pressed(ctx, hx, hy, w * k, h * k, x, 620, () => sh.draw(ctx, n, x, 620, {}));
      this.hits.add(hx, hy, w * k, h * k, () => { if (i === 2) { try { window.open('mailto:?subject=Boomlings&body=' + encodeURIComponent(m.plain)); } catch (e) { /* ignore */ } } else this.share(); });
    });
    { const n = 'okBtn_001.png', sh = sheet(n), [w, h] = sh.size(n), hx = (500.3 - w / 2) * k + cx - cx * k, hy = (780.3 - h / 2) * k + cy - cy * k; this.pressed(ctx, hx, hy, w * k, h * k, 500.3, 780.3, () => sh.draw(ctx, n, 500.3, 780.3, {})); this.hits.add(hx, hy, w * k, h * k, () => this.app.back()); }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- DailyRewardLayer
export class DailyRewardScreen extends Screen {
  constructor(app, day, gold, fresh) { super(app); this.day = day; this.gold = gold; this.fresh = fresh; this.under = app.top(); this.tIn = 0; }
  // DailyRewardLayer::setupRewards: each row is two copies of fullTabBG_001 scaled 0.84, one rotated 180 degrees, so the
  // top has the sprite's rounded rim and the bottom has the rotated copy's. Tints: future 0x646464, past 0xc8c8dc.
  rowCanvas(w, h, tint) {
    this._rows = this._rows || {};
    const key = w + 'x' + h + (tint || '');
    if (this._rows[key]) return this._rows[key];
    const bm = this.G.ui.bitmap('fullTabBG_001.png'), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), k = 0.84, hs = Math.round(bm.height * k), cap = 28, ck = cap * k;
    const slice = (dy) => {
      x.drawImage(bm, 0, 0, cap, bm.height, 0, dy, ck, hs);
      x.drawImage(bm, cap, 0, bm.width - 2 * cap, bm.height, ck, dy, w - 2 * ck, hs);
      x.drawImage(bm, bm.width - cap, 0, cap, bm.height, w - ck, dy, ck, hs);
    };
    slice(0);
    x.save(); x.translate(w, h); x.rotate(Math.PI); slice(0); x.restore();
    if (tint) {
      const base = document.createElement('canvas'); base.width = w; base.height = h; base.getContext('2d').drawImage(c, 0, 0);
      x.globalCompositeOperation = 'multiply'; x.fillStyle = tint; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(base, 0, 0);
    }
    return (this._rows[key] = c);
  }
  update(dt) { super.update(dt); this.tIn += dt; }
  draw(ctx) {
    if (this.under) this.under.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.59 * Math.min(1, this.tIn / 0.14)) + ')'; ctx.fillRect(0, -OY, W, CH);
    this.hits.clear();
    const t = Math.min(1, this.tIn / 0.5), p = 0.6;
    const k = t >= 1 ? 1 : 0.1 + 0.9 * (Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1);
    const { ui, menu } = this.G, f = this.f, cx = 320, cy = 480;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    // layout measured from the real game's popup (B = banner centre; everything else hangs off it), 640x960 canvas px
    const B = 293;
    ctx.save(); ctx.translate(cx - 198, B + 5); ctx.scale(0.85, 0.85); nineSlice(ctx, this.G.img.sq01, 0, 0, 396 / 0.85, 488 / 0.85, 50); ctx.restore(); // the real frame is thinner than square01 at full size
    menu.draw(ctx, 'shopTabBG_001.png', cx, B, { scale: 1.02 });
    f.big.draw(ctx, 'Daily Reward', cx, B - 2, { scale: 0.58 });
    // DailyRewardLayer::init text: new reward, or the "come back tomorrow" text when it was already collected
    if (this.fresh) {
      const a = 'Daily reward ', n = String(this.gold), sc = 0.63, wa = f.big.measure(a, sc), wn = f.big.measure(n, sc), x0 = cx - (wa + wn) / 2;
      f.big.draw(ctx, a, x0, B + 81, { align: 'left', scale: sc });
      f.big.tinted('#5cff4a').draw(ctx, n, x0 + wa, B + 81, { align: 'left', scale: sc });
      f.gold.draw(ctx, 'Gold Coins!', cx, B + 127, { scale: 237 / f.gold.measure('Gold Coins!', 1) });
    } else {
      richText(ctx, f.big, 'Return <cg>tomorrow</c> for a <cy>new reward</c>!', cx, B + 92, { scale: 0.55, maxWidth: 360, align: 'center', lineHeight: 46 });
    }
    // the four streak rows: past days dim, today bright, future days dark (tints from DailyRewardLayer::setupRewards)
    for (let d = 1; d <= 4; d++) {
      const y = B + 212 + (d - 1) * 66.5, rowW = 360, rowH = 62, x = cx - rowW / 2, gold = [25, 50, 100, 200][d - 1];
      const future = d > this.day, past = d < this.day;
      ctx.drawImage(this.rowCanvas(rowW, rowH, future ? 'rgb(100,100,100)' : past ? 'rgb(200,200,220)' : null), x, y - rowH / 2);
      const lab = future ? '#002245' : past ? '#0086bf' : null;
      (lab ? f.big.tinted(lab) : f.big).draw(ctx, 'Day ' + d, x + 26, y, { align: 'left', scale: 0.65, alpha: future ? 0.78 : past ? 0.49 : 1 });
      const pc = future ? '#6f7f66' : past ? '#78958a' : null;
      (pc ? f.gold.tinted(pc) : f.gold).draw(ctx, String(gold), x + rowW - 68, y, { align: 'right', scale: 0.84 });
      this.coin(ctx, x + rowW - 39, y, 27);
    }
    f.gold.draw(ctx, 'A new reward every day!', cx, B + 463, { scale: 0.52 });
    this.sprite(ctx, ui, 'okBtn_001.png', cx, B + 534, 0.62, () => this.app.back());
    ctx.restore();
  }
}

// ---------------------------------------------------------------- TutorialPopup (FLAlertLayer showing a tutorial_*.png)
export class TutorialPopup extends Screen {
  constructor(app, img, done) { super(app); this.img = img; this.done = done; this.under = app.top(); this.tIn = 0; this.was = app.G.scene && app.G.scene.paused; if (app.G.scene) app.G.scene.paused = true; app.G.audio.play('showTutorial.ogg', 0.8); }
  update(dt) { super.update(dt); this.tIn += dt; }
  draw(ctx) {
    if (this.under) this.under.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.6 * Math.min(1, this.tIn / 0.15)) + ')'; ctx.fillRect(0, -OY, W, CH);
    this.hits.clear();
    const t = Math.min(1, this.tIn / 0.5), p = 0.6;
    const k = t >= 1 ? 1 : 0.1 + 0.9 * (Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1);
    const w = this.img.width, h = this.img.height;
    ctx.save(); ctx.translate(319.33, 420.07); ctx.scale(k, k);
    ctx.drawImage(this.img, -w / 2, -h / 2, w, h);
    // okBtn_001 (TutorialPopup::init): a child of the popup layer, so it scales in with the panel
    this.G.ui.draw(ctx, 'okBtn_001.png', 180.97, 318.73);
    ctx.restore();
    const [bw, bh] = this.G.ui.size('okBtn_001.png'); this.hits.add(500.3 - bw / 2, 738.8 - bh / 2, bw, bh, () => this.close());
  }
  close() { if (this.app.G.scene) this.app.G.scene.paused = !!this.was; this.app.back(); if (this.done) this.done(); }
}

// ---------------------------------------------------------------- GameOverLayer
export class ResultsScreen extends Screen {
  constructor(app, scene, sum) {
    super(app); this.scene = scene; this.sum = sum; this.tab = 'global';
    this.list = new ScrollArea(20.4, 494.2, 599.6, 315.47);
    // GameOverLayer::animateStats timeline: stars/new-highscore drop in from 1.2s (+0.4s each), counters run in sequence
    this.nStars = Math.min(10, Math.max(1, sum.level));
    this.tCount = [0.3, 1.1, 1.9]; this.cDur = 0.8; this.tBar = 2.7; this.fired = {};
    app.G.audio.play('counter001.ogg', 0.5);
  }
  update(dt) {
    super.update(dt);
    const fx = this.app.G.fx, s = this.sum, t = this.t, fire = (k, at, fn) => { if (!this.fired[k] && t >= at) { this.fired[k] = 1; fn(); } };
    for (let i = 0; i < this.nStars; i++) fire('star' + i, 1.2 + i * 0.4 + 0.3, () => { if (fx) fx.spawn('starEffect', ...this.starPos(i)); this.app.G.audio.play('click08.ogg', 0.4); });
    if (s.newBest) fire('hs', 1.2 + this.nStars * 0.4 + 0.3, () => { if (fx) { fx.spawn('highscoreEffect01', 320, 30.7); fx.spawn('highscoreEffect02', 320, 30.7); } this.app.G.audio.play('highscoreGet02.ogg', 0.7); });
    fire('bar', this.tBar, () => { if (s.rankAfter > s.rankBefore && fx) fx.spawn('lvlupEffect', 95, 376); });
  }
  starPos(i) { const n = this.nStars, gap = 28; return [320 + (i - (n - 1) / 2) * gap, 127.7]; }
  // CCSequence(delay, fade + scale-in from 2.0): the "drop" used for stars and the highscore banner
  drop(t0) { const k = Math.max(0, Math.min(1, (this.t - t0) / 0.3)); return { a: k, s: 2 - k * k }; }
  counter(i) { return Math.max(0, Math.min(1, (this.t - this.tCount[i]) / this.cDur)); }
  draw(ctx) {
    const { ui } = this.G, s = this.sum, f = this.f, t = this.t;
    if (!this.fy) { this.fy = f.big.multiplied('#ffff3c'); this.fo = f.big.multiplied('#ffc81e'); this.fg = f.big.multiplied('#00ff00'); this.fb = f.big.multiplied('#feff74'); }
    this.hits.clear();
    this.scene.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.49)'; ctx.fillRect(0, -OY, W, CH);
    ui.draw(ctx, 'gameOver_top_001.png', 320, 196.7, { scale: 1.0027 });
    f.big.draw(ctx, 'LEVEL ' + s.level, 320, 91.6, { scale: 1 });
    ctx.fillStyle = 'rgba(0,40,100,0.45)'; ctx.fillRect(140, 129, 360, 3);
    for (let i = 0; i < this.nStars; i++) { const d = this.drop(1.2 + i * 0.4); if (d.a <= 0) continue; const [x, y] = this.starPos(i); ui.draw(ctx, 'star_001.png', x, y, { scale: d.s, alpha: d.a }); }
    const lx = 259.67, c0 = this.counter(0), c1 = this.counter(1), c2 = this.counter(2);
    f.big.draw(ctx, 'Score:', lx, 173.6, { align: 'right' });
    this.fy.draw(ctx, fmt(s.score * c0), 280, 173.6, { align: 'left' });
    f.big.draw(ctx, 'Gold:', lx, 233.7, { align: 'right' });
    if (t >= this.tCount[1]) {
      this.fo.draw(ctx, fmt(s.base * c1), 280, 233.7, { align: 'left' });
      if (s.gold - s.base > 0 && c1 >= 1) this.fb.draw(ctx, '+' + fmt(s.gold - s.base), 280 + this.fo.measure(fmt(s.base), 1) + 14, 233.7, { align: 'left', scale: 0.8 });
    }
    f.big.draw(ctx, 'XP:', lx, 293.7, { align: 'right' });
    if (t >= this.tCount[2]) this.fg.draw(ctx, fmt(s.xpGain * c2), 280, 293.7, { align: 'left' });
    if (s.newBest) { const d = this.drop(1.2 + this.nStars * 0.4); if (d.a > 0) ui.draw(ctx, 'newHighscore_001.png', 320, 31.7, { scale: d.s, alpha: d.a }); }
    // rank pill (BoomXPBar) as on the Extras hub, 32.3 lower
    const rk = s.rankAfter, need = rk >= MAX_RANK ? 1 : requiredXP(rk + 1), frac = rk >= MAX_RANK ? 1 : Math.min(1, s.xpNow / need), dy = 36.3;
    ui.draw(ctx, 'XPBarBGBG_001.png', 319.93, 339.28 + dy, { scaleX: 1.0023, scaleY: 0.984 });
    ui.draw(ctx, 'XPBarBG_001.png', 370.3, 339.67 + dy);
    const barW = ui.size('XPBarBG_001.png')[0] - 16, barH = ui.size('XPBarBG_001.png')[1] - 22, fe = Math.max(0, Math.min(1, (t - this.tBar) / 1.0)), fw = Math.max(0, barW * frac * fe);
    ctx.save(); ctx.beginPath(); ctx.rect(370.3 - barW / 2, 339.67 + dy - barH / 2, fw, barH); ctx.clip(); ctx.drawImage(this.G.img.xpbar, 370.3 - barW / 2, 339.67 + dy - barH / 2, barW, barH); ctx.restore();
    ui.draw(ctx, 'XP_Border_001.png', 370.3, 339.67 + dy);
    this.rankIcon(ctx, rk, 95.67, 342.67 + dy, 61);
    f.big.draw(ctx, rankTitle(rk).toUpperCase(), 371.6, 342.7 + dy, { scale: 0.72 });
    // share: pulsing ScaleTo easeInOut loop
    this.sprite(ctx, ui, 'shareBtn_001.png', 556, 88, 1 + 0.06 * Math.sin(t * 5.2), () => this.app.go(new ShareDialog(this.app, 0, this.sum.level)));
    // tab strip + list (BoomHighscoreList type 6)
    const tabs = [['global', 'globalTab', 176], ['friends', 'friendsTab', 176], ['local', 'localTab', 176], ['stats', 'statsTab', 80]];
    const place = []; { let x = 16; for (const [k, n, w] of tabs) { place.push({ k, n, w, x }); x += w; } }
    for (const [ti, e] of place.entries()) this.sprite(ctx, ui, e.n + (this.tab === e.k ? '_on' : '') + '_001.png', e.x + e.w / 2 + [2.5, 0.83, -0.83, -2.5][ti], 468.3, 1, () => { this.tab = e.k; this.list.off = 0; });
    const act = place.find((e) => e.k === this.tab), sc = this.list;
    brownList(ctx, sc.x, sc.y, sc.w, sc.h, 0, 0, 6.5, 7.3);
    sc.begin(ctx);
    if (this.tab === 'local') {
      const L = this.G.save.d.scores.slice(0, 20);
      L.forEach((r, i) => highscoreRow(this, ctx, r, i, 4 + i * 80, sc.w, i % 2 ? 0.14 : 0.0, i === s.lbIndex));
      sc.contentH = 4 + L.length * 80;
    } else if (this.tab === 'friends') {
      richText(ctx, f.gold, 'Login to Facebook to compare scores with friends.', 105.07, 81.6, { scale: 0.79, maxWidth: 400, lineHeight: 46 }); ui.draw(ctx, 'fbLogInBtn_001.png', 299.53, 237.57); this.hits.add(sc.x + 299.53 - 116, sc.y + 237.57 - 40, 232, 80, () => this.app.dialog('Offline', 'Facebook is not available in the offline version of the game.', [['OK', null]])); sc.contentH = sc.h;
    } else if (this.tab === 'stats') {
      ExtrasPanel.prototype.drawStats.call(this, ctx, sc);
    } else {
      const api = this.G.api;
      if (api && api.online) {
        if (this.lb === undefined) { this.lb = null; Promise.resolve(api.pendingScore).catch(() => {}).then(() => api.leaderboard()).then((j) => { this.lb = j; }).catch(() => { this.lb = false; }); }
        if (this.lb === false) { this.f.gold.draw(ctx, 'COULD NOT LOAD', sc.w / 2, 150, { scale: 0.62 }); sc.contentH = sc.h; }
        else if (this.lb) {
          const list = this.lb.entries, me = api.user && api.user.name;
          if (!list.length) this.f.gold.draw(ctx, 'NO SCORES YET', sc.w / 2, 150, { scale: 0.62 });
          list.forEach((e, i) => highscoreRow(this, ctx, { ...e, icon: e.icon || 'kIcon_001' }, i, 4 + i * 80, sc.w, i % 2 ? 0.14 : 0.0, !!me && e.name === me));
          sc.contentH = Math.max(sc.h, 4 + list.length * 80);
        } else sc.contentH = sc.h;
      } else sc.contentH = sc.h;
      if (!api || !api.online || this.lb === null) {
        const img = spinnerImg(this.G);
        if (img) { ctx.save(); ctx.translate(sc.w / 2, sc.h / 2); ctx.rotate(t * 5.2); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore(); }
      }
    }
    sc.end(ctx); sc.clamp();
    ui.draw(ctx, 'blueBottomBar_001.png', 320, sc.y + sc.h + 15);
    const ys = 880.3, bw = ui.size('MenuBtn_001.png')[0];
    this.sprite(ctx, ui, 'MenuBtn_001.png', 320 - bw - 40, ys, 1, () => this.app.toMenu());
    this.sprite(ctx, ui, 'ReplayBtn_001.png', 320, ys, 1, () => this.app.startFlow());
    this.sprite(ctx, ui, 'ShopBtn_001.png', 320 + bw + 40, ys, 1, () => this.app.go(new ShopScreen(this.app)));
  }
  down(x, y) { this.pd = this.hits.hit(x, y); this.list.down(x, y); }
  move(x, y) { this.list.move(x, y); }
  up(x, y) { const tap = this.list.up(); const h = this.hits.hit(x, y); if (tap && h && this.pd && h.x === this.pd.x && h.y === this.pd.y && h.fn) { this.G.audio.play('click07.ogg', 0.6); h.fn(); } this.pd = null; }
  wheel(dy) { this.list.wheel(dy); }
}
