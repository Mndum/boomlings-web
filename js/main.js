import { Atlas } from './atlas.js';
import { BMFont } from './bmfont.js';
import { AnimLibrary } from './anim.js';
import { AudioMan } from './audio.js';
import { loadImage } from './plist.js';
import { PlayScene, SFX_ALL } from './game.js';
import { Save } from './save.js';
import { Particles } from './particles.js';
import { Store } from './store.js';
import { Ach } from './ach.js';
import { W, H, CH, OY, panel, pillBtn, Hits, roundRect } from './ui.js';
import { Screen, MenuScreen, PowerSelectScreen, ResultsScreen, Dialog, TutorialPopup, DailyRewardScreen, ExtrasPanel, ShopScreen, ConfirmPurchase, ShareDialog, easeIO, SLIDE_T, PX, PY } from './screens.js';
import { ExtrasScreen, IconSelect, ContinuePanel } from './extras.js';
import { FreeGoldScreen } from './freegold.js';
import { Api } from './api.js';
import { Pranks } from './pranks.js';
import { accountFlow, discordConnect } from './account.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const loadingEl = document.getElementById('loading');

// fit the canvas to what is really visible (phones: URL bar showing/hiding, rotation, keyboard)
function fit() {
  const vv = window.visualViewport, w = Math.min(window.innerWidth, (vv && vv.width) || Infinity), h = Math.min(window.innerHeight, (vv && vv.height) || Infinity);
  const s = Math.min(w / W, h / CH);
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(CH * s) + 'px';
}
window.addEventListener('resize', fit); window.addEventListener('orientationchange', () => setTimeout(fit, 150)); fit();
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

const G = { ctx, audio: new AudioMan('assets/'), onDeath: null };
const SKIP_ITEM = { 5: 'kItemSkip', 10: 'kItemSkipB', 15: 'kItemSkipC' };

// ---- the in-game screen: routes input to the scene and draws the powerup buttons ----
class PlayScreen extends Screen {
  constructor(app) { super(app); this.scene = G.scene; }
  // the pause button is a CCMenuItemSpriteExtra: 1.26 scale on press (0.3s bounce), pauses when released over it
  draw(c) { this.scene.pauseK = this.pscale(0, 0, 110, 110); this.scene.draw(c); }
  update(dt) { this.t += dt; this.scene.update(dt); }
  down(x, y) {
    const sc = this.scene;
    if (x < 110 && y < 110) { this.pp = true; this.pressTo('55,55', 1.26); return; }
    if (sc.shopTap(x, y)) return;
    for (const b of sc.powerButtons()) if (b.usable && Math.abs(x - b.x) < b.size / 2 + 8 && Math.abs(y - b.y) < b.size / 2 + 8) { sc.usePower(b.tag); return; }
    sc.pointerDown(x, y);
  }
  up(x, y) {
    if (this.pp) { this.pp = false; this.pressTo('55,55', 1); if (x < 110 && y < 110) { this.app.pause(); } return; }
    this.scene.pointerUp(x, y);
  }
}
// PauseLayer: the pauseBG panel rises from the bottom; rank mascot in the notch; Main Menu / Free Gold buttons,
// elapsed-time label and music / effects sliders (positions from the decompiled layer, 320x480 y-up points).
// PauseLayer (measured from the real game): pauseBG panel, dark rounded box with Time label, three buttons, two sliders.
class PauseScreen extends Screen {
  constructor(app, play) { super(app); this.play = play; this.drag = null; this.tIn = 0; this.closing = false; }
  update(dt) { this.tIn += dt; if (this.closing && this.tIn > SLIDE_T) { G.scene.paused = false; this.app.back(); } }
  close() { if (!this.closing) { this.closing = true; this.tIn = 0; } }
  sliderGeom(i) { return { x: 113, w: 420, y: i === 0 ? 660 : 780 }; }
  draw(c) {
    this.hits.clear(); this.play.draw(c);
    const { ui, fonts: f, save } = G, sc = this.play.scene;
    // PauseLayer is a SlideInLayer: CCEaseInOut(rate 2) over 0.5s, the dim fades linearly
    const u = Math.min(1, this.tIn / SLIDE_T), k = easeIO(this.closing ? 1 - u : u), dk = this.closing ? 1 - u : u;
    c.fillStyle = 'rgba(0,0,0,' + 0.55 * dk + ')'; c.fillRect(0, -OY, W, CH);
    c.save(); c.translate(0, (1 - k) * 1066.7);
    ui.draw(c, 'pauseBG_001.png', 320, 16 + 924 / 2 + 19.6);
    // dark rounded box
    { const g = c.createLinearGradient(0, 160, 0, 900); g.addColorStop(0, '#00304c'); g.addColorStop(0.35, '#003750'); g.addColorStop(1, '#001f31'); c.fillStyle = g; roundRect(c, 60, 159.7, 520, 740, 16); c.fill(); }
    const secs = Math.floor(sc.playTime || 0), t = [Math.floor(secs / 3600), Math.floor(secs / 60) % 60, secs % 60].map((v) => String(v).padStart(2, '0')).join(':');
    f.gold.draw(c, 'Time:', 307, 221.33, { align: 'right', scale: 0.79 });
    (f.numbers || f.gold).draw(c, t, 320, 219.33, { align: 'left', scale: 0.7 });
    this.button(c, 'Main Menu', 320, 293.63, 216, 33, () => this.confirmMenu(), { scale: 1 });
    this.button(c, 'Free Gold', 320, 400, 216, 33, () => this.app.go(new FreeGoldScreen(this.app)), { scale: 1 });   // same Free Gold screen as the main menu
    this.button(c, 'Upgrade', 320, 506, 216, 33, () => this.app.go(new ShopScreen(this.app)), { scale: 1 });   // real: opens the Store (MoveTo 1.0 BounceOut drop)
    [['Music', save.d.opts.mv ?? 1], ['Effects', save.d.opts.sv ?? 1]].forEach(([lab, v], i) => {
      const g = this.sliderGeom(i);
      f.gold.draw(c, lab + ', ' + Math.round(v * 100) + '%', 320, g.y - 39.85, { scale: 0.79 });
      const gr = G.img.groove, bar = G.img.sliderbar, tx = g.x + (g.w - 13) * v;
      c.drawImage(gr, g.x, g.y - gr.height / 2);
      if (bar) { c.save(); c.beginPath(); c.rect(g.x + 8, g.y - bar.height / 2 + 3.3, Math.max(0, tx - g.x - 8), bar.height - 6.6); c.clip(); for (let px = g.x + 8; px < g.x + g.w - 8; px += bar.width) c.drawImage(bar, px, g.y - bar.height / 2); c.restore(); }
      const th = this.drag === i ? G.img.thumbSel : G.img.thumb;
      c.drawImage(th, tx - th.width * 0.49, g.y - th.height * 0.49, th.width * 0.98, th.height * 0.98);
      this.hits.add(g.x - 20, g.y - 40, g.w + 40, 80, null, 's' + i);
    });
    this.sprite(c, ui, 'playBtn_001.png', 320, 60, 0.852, () => this.app.resume());
    c.restore();
  }
  confirmMenu() { this.app.dialog('Goto Main Menu?', 'Return to the <cg>Main Menu</c>?  \n<cy>(Your game will be saved)</c>', [['CANCEL', null], ['OK', () => this.app.saveAndMenu()]]); }
  setSlider(i, x) {
    const g = this.sliderGeom(i), v = Math.max(0, Math.min(1, (x - g.x) / (g.w - 13))), o = G.save.d.opts;
    if (i === 0) { o.mv = v; G.audio.setMusicVol(v); } else { o.sv = v; G.audio.sv = v; }
    G.save.flush();
  }
  down(x, y) { const h = this.hits.hit(x, y); if (h && h.tag === 's0') { this.drag = 0; this.setSlider(0, x); } else if (h && h.tag === 's1') { this.drag = 1; this.setSlider(1, x); } else super.down(x, y); }
  move(x) { if (this.drag !== null) this.setSlider(this.drag, x); }
  up(x, y) { if (this.drag !== null) { this.drag = null; return; } super.up(x, y); }
}

class App {
  get Extras() { return ExtrasScreen; }
  get FreeGold() { return FreeGoldScreen; }
  get Confirm() { return ConfirmPurchase; }
  get ShareDialog() { return ShareDialog; }
  get Highscores() { return ExtrasPanel; }
  get IconSelect() { return IconSelect; }
  constructor() { this.G = G; this.stack = []; this.toasts = []; this.toastT = 0; }
  top() { return this.stack[this.stack.length - 1]; }
  // CCTransitionFade(0.5): full scenes fade to black and back; panels, dialogs and popups do not
  isScene(s) { return s instanceof ExtrasScreen || s instanceof FreeGoldScreen || s instanceof PowerSelectScreen || s instanceof MenuScreen || s instanceof ResultsScreen || s instanceof PlayScreen; }
  swap(fn) { if (this.fade) return fn(); this.fade = { t: 0, fn, did: false }; }
  go(s) { if (this.isScene(s) && this.top() && !(this.top() instanceof PlayScreen && false)) this.swap(() => this.stack.push(s)); else this.stack.push(s); }
  back() { if (this.stack.length > 1) { const t = this.top(); if (this.isScene(t)) this.swap(() => this.stack.pop()); else this.stack.pop(); } }
  // GameManager tutorials: each popup shows once per save (tutorial_*.png from the APK)
  async tutorial(key, file, done) {
    if (G.save.seen(key)) { if (done) done(); return; }
    G.save.markSeen(key);
    try { const img = await loadImage('assets/' + file + '-hd.png'); this.go(new TutorialPopup(this, img, done)); } catch (e) { if (done) done(); }
  }
  dialog(t, m, b) { this.go(new Dialog(this, t, m, b)); }
  account() { return accountFlow(this); }
  discord() { return discordConnect(this); }
  netError() { this.go(new Dialog(this, 'Error', 'Something went wrong. Please try again later!', [['OK', null]], true)); } // offline: LoadingCircle, then the same error the real game shows now that its servers are gone
  toast(title, sub, sfx) { this.toasts.push({ title, sub, t: 0 }); if (sfx) G.audio.play(sfx, 0.8); }
  toMenu() {
    if (G.scene && G.scene.started) G.scene.abandon();
    this.swap(() => { this.stack = [new MenuScreen(this)]; });
    G.audio.stopMusic(); G.audio.playMusic('BoomlingsTitle.mp3', 0.5);
  }
  startFlow() { if (!G.save.seen('tutDone')) { this.swap(() => this.beginGame(1)); return; }   // first launch: Play goes straight into the tutorial game (no Powerups screen)
    if (G.save.d.run) { if (!(this.top() instanceof ContinuePanel)) this.stack.push(new ContinuePanel(this)); return; } this.swap(() => { this.stack = [new MenuScreen(this), new PowerSelectScreen(this)]; }); }
  // MenuLayer::onDaily -> DailyRewardLayer::create(isNew, day)
  // MenuLayer::onDaily -> GameSocialManager::getDailyReward, which the offline build jumps straight into the Java showDailyReward:
  // Offline.claim("daily", 24h) -> awardGold(50), otherwise the Android "Unavailable" alert
  claimDaily() {
    if (G.store.claimOffline('daily', 86400000)) { G.save.addGold(50); return; }
    this.dialog('Unavailable', 'Check back tomorrow for a new Daily Reward!', [['OK', null]]);
  }
  rename() {
    const inp = document.createElement('input');
    inp.maxLength = 12; inp.value = G.save.d.name; inp.placeholder = 'Your name';
    const r = canvas.getBoundingClientRect();
    inp.style.cssText = 'position:fixed;z-index:9;font:700 20px Helvetica,Arial,sans-serif;text-align:center;border:3px solid #fff;border-radius:10px;background:#0a3a8a;color:#fff;padding:8px;width:' + Math.min(260, r.width * 0.7) + 'px;left:' + (r.left + r.width / 2 - Math.min(260, r.width * 0.7) / 2 - 11) + 'px;top:' + (r.top + r.height * (matchMedia('(pointer: coarse)').matches ? 0.2 : 0.45)) + 'px';   /* higher on phones, above the keyboard */
    let fin = false; const done = (ok) => { if (fin) return; fin = true; if (ok && inp.value.trim()) { G.save.d.name = inp.value.trim().slice(0, 12); G.save.flush(); } inp.remove(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
    document.body.appendChild(inp); inp.focus(); inp.select();
  }
  beginGame(startLevel = 1, resume = false) {
    const key = resume ? null : SKIP_ITEM[startLevel];
    if (key) { if ((G.save.d.items[key] || 0) < 1) startLevel = 1; else { G.save.d.items[key]--; G.save.flush(); } }
    G.scene = new PlayScene(G);
    this.stack = [new MenuScreen(this), new PlayScreen(this)];
    G.audio.stopMusic();
    if (resume) { const r = G.save.d.run; G.save.d.run = null; G.save.flush(); G.scene.resumeRun(r); } else G.scene.startNewGame({ startLevel });
  }
  // PauseLayer "Main Menu": the run is saved and Play resumes it
  saveAndMenu() { G.scene.paused = false; G.scene.saveRun(); this.toMenu(); }
  pause() { const s = this.top(); if (s instanceof PlayScreen && !G.scene.over) { G.scene.paused = true; G.audio.play('pause01.ogg', 0.7); this.go(new PauseScreen(this, s)); } }
  resume() { const t = this.top(); if (t instanceof PauseScreen) t.close(); else { G.scene.paused = false; this.back(); } }
  restart() { if (G.scene.score > 0) G.scene.finalize(); G.scene.abandon(); this.beginGame(1); }
  endRun() { G.scene.paused = false; this.showResults(); }
  showResults() {
    const sum = G.scene.finalize();
    this.swap(() => { this.stack = [new MenuScreen(this), new ResultsScreen(this, G.scene, sum)]; });
  }
  // called by the scene when the player dies
  onDeath(scene) {
    // GameManager::playerDied: an armed Ankh of Life revives (PlayLayer::playRespawnEffect), otherwise the game over layer
    if (scene.ankh && !scene.revived) { scene.ankh = false; scene.revive(true); } else this.showResults();
  }
}

const app = new App();
G.app = app;
G.onDeath = (scene) => app.onDeath(scene);
let last = performance.now();

async function boot() {
  try {
    const save = new Save();
    const imgNames = { sq01: 'square01_001-hd.png', sq03: 'square03_001-hd.png', btn: 'buttonBG2-hd.png', groove: 'slidergroove-hd.png', thumb: 'sliderthumb-hd.png', thumbSel: 'sliderthumbsel-hd.png', sliderbar: 'sliderBar-hd.png', loading: 'loadingCircle-hd.png', xpbar: 'XPBar-hd.png', pointsbar: 'pointsBar-hd.png', more: 'moreGamesBtn_001-hd.png' };
    const imgKeys = Object.keys(imgNames);
    const imgs = await Promise.all(imgKeys.map((k) => loadImage('assets/' + imgNames[k])));
    G.img = Object.fromEntries(imgKeys.map((k, i) => [k, imgs[i]]));
    // LoadingLayer: BlankBG, RobTop logo, a random loading line (goldFont) and a progress bar (slidergroove + sliderBar)
    const LINES = ['Blink twice to continue', 'To the Boommobile!', 'I R Game Master', 'So worth the wait', 'Bah, humbug!', 'Detonating bombs', 'Building a castle', 'Beware of Trolls', 'Wait for my signal!', 'Random Nonsence', 'Get to the Chopper!', 'What is the Boom?', "It's a trap!", 'Skulls are just misunderstood', 'I am the Boom!', 'Waiting is optional', 'Watch out for the Bandits', 'Look closely...', 'Fire the cannon!', 'Chain bomb frenzy', 'Look behind you', 'You should play more often...', 'Mu mu mu Multikill!', 'zzzZZZ...', 'Insert funny quote', 'Think of a joke, then laugh', 'Arr, here be dragons!', 'Best loading screen EVER!', 'Uh oh...', 'Do a barrel roll', 'Grow 10 feet to continue', 'Sorry about the ads...', 'Boomlings need to eat too', 'This.. IS.. BOOMLINGS!', 'Catching Mega Blobs', 'Mega Bombs are awesome', 'Running low on Blobs...', 'Quickly, hide!', 'Up, Up, Down, Down, Left, Right, Left, Right, B, A', 'Why not?', 'Prepare for battle!', 'Speillng is overraetd', 'Just kidding', 'Awesome entertainment imminent', "You can't handle The BOOM!", 'Level up!', 'Rage quit incoming...', 'What if game plays you?', 'Running out of ideas', 'Rate the game, you will...', 'Nice day to rate the game!', "Developers don't need to sleep!", 'Boomlings like Stars...', 'The Boom approaches..'];
    const [lstart, lgold] = await Promise.all([Atlas.load('assets/startMenuSheet-hd'), BMFont.load('assets/goldFont-hd')]);
    G.loading = { p: 0, text: LINES[Math.floor(Math.random() * LINES.length)], start: lstart, gold: lgold, t0: performance.now() };
    loadingEl.remove(); requestAnimationFrame(frame);
    const [obj, ui, menu, start, icons, big, gold, chat, level, numbers, scoreF, coin, ach, sheet2] = await Promise.all([
      Atlas.load('assets/ObjectSheet-hd'), Atlas.load('assets/BoomUISheet-hd'), Atlas.load('assets/menuSheet-hd'), Atlas.load('assets/startMenuSheet-hd'), Atlas.load('assets/boomIconSheet-hd'),
      BMFont.load('assets/bigFont-hd'), BMFont.load('assets/goldFont-hd'), BMFont.load('assets/chatFont-hd'), BMFont.load('assets/levelFont-hd'), BMFont.load('assets/numbersFont-hd'), BMFont.load('assets/scoreFont2-hd'),
      loadImage('assets/boomCoin-hd.png'), Ach.load(save), Atlas.load('assets/BoomSheet02-hd'),
    ]);
    G.obj = obj; G.ui = ui; G.menu = menu; G.start = start; G.icons = icons; G.fonts = { big, gold, chat, level, numbers, score: scoreF }; G.coin = coin; G.sheet2 = sheet2; G.save = save; G.ach = ach;
    G.lib = await AnimLibrary.load('assets/', obj); G.libXL = new AnimLibrary(G.lib.defs, G.lib.descs, menu); // xl_Block frames live in menuSheet
    G.fx = await Particles.load('assets/', await Atlas.load('assets/particleImgSheet'));
    G.store = await Store.load(save, ach); ach.store = G.store;
    G.api = new Api(G); G.api.init().then(() => { G.pranks = new Pranks(G, app, canvas, W, CH); G.pranks.start(); });   // optional backend: stays offline when the site is not served with the Worker
    ach.onUnlock = (a) => app.toast('Achievement unlocked!', a.title, 'getAch001.ogg');
    ach.onIconUnlock = (ic) => app.toast('You unlocked ' + ic.title + '!', 'New icon', 'unlock004.ogg');
    G.audio.musicOn = save.d.opts.music; G.audio.enabled = save.d.opts.sfx; G.audio.mv = save.d.opts.mv ?? 1; G.audio.sv = save.d.opts.sv ?? 1;
    G.audio.preload(SFX_ALL);
    G.scene = new PlayScene(G);
    window.snap = async (n) => (await fetch('http://localhost:8766/save?name=' + n, { method: 'POST', body: canvas.toDataURL('image/png') })).status; // dev: save the canvas for pixel comparison
    // dev: record the canvas every frame to the local receiver for animation comparison
    window.rec = (ms, name) => new Promise((res) => { const fr = [], t0 = performance.now(); const tick = () => { const t = performance.now() - t0; fr.push([t, canvas.toDataURL('image/jpeg', 0.85)]); if (t < ms) requestAnimationFrame(tick); else { Promise.all(fr.map((f, i) => fetch('http://localhost:8766/save?name=' + name + '_' + String(i).padStart(3, '0') + '_' + Math.round(f[0]), { method: 'POST', body: f[1] }))).then(() => res(fr.length)); } }; tick(); });
    window.__boom = { G, app, get scene() { return G.scene; } }; // debug hook for tests
    G.loading.p = 1; await new Promise((r) => setTimeout(r, Math.max(0, 1200 - (performance.now() - G.loading.t0)))); // keep the loading layer visible briefly
    app.swap(() => { app.stack = [new MenuScreen(app)]; G.loading = null; });
    app.stack = app.stack.length ? app.stack : [];
    if (save.d.name === 'Player' && !save.seen('name')) { save.markSeen('name'); setTimeout(() => app.rename(), 400); }
  } catch (e) {
    loadingEl.textContent = 'Failed to load: ' + e.message + ' (serve this folder over http, not file://)';
    console.error(e);
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (app.fade) { const f = app.fade; f.t += dt; if (!f.did && f.t >= 0.25) { f.did = true; f.fn(); } if (f.t >= 0.5) app.fade = null; }
  const top = app.top();
  if (G.loading && !G.fonts) { const L = G.loading, a = L.start; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#004f95'; ctx.fillRect(0, 0, W, CH); ctx.save(); ctx.translate(0, OY); a.draw(ctx, 'BlankBG_001.png', W / 2, H / 2, { scale: Math.max(W / a.size('BlankBG_001.png')[0], CH / a.size('BlankBG_001.png')[1]) }); a.draw(ctx, 'RobTopLogoBig_001.png', 320, 480.5); L.gold.draw(ctx, L.text, 320, 616, { scale: 516 / L.gold.measure(L.text, 1) });
    // slidergroove + sliderBar fill
    if (G.img && G.img.groove) { const gr = G.img.groove, br = G.img.sliderbar, gx = 320 - gr.width / 2, gy = 660 - gr.height / 2; ctx.drawImage(gr, gx, gy); if (br) { ctx.save(); ctx.beginPath(); ctx.rect(gx + 4, gy, Math.max(0, (gr.width - 8) * L.p), gr.height); ctx.clip(); for (let px = gx + 4; px < gx + gr.width - 4; px += br.width) ctx.drawImage(br, px, gy + (gr.height - br.height) / 2); ctx.restore(); } }
    ctx.restore(); requestAnimationFrame(frame); return; }
  if (G.loading) { G.loading.p = Math.min(1, (performance.now() - G.loading.t0) / 1200); }
  if (top) top.update(dt);
  // keep the playfield simulating underneath dialogs (e.g. the Ankh prompt) but not under the pause menu
  if (top instanceof Screen && !(top instanceof PlayScreen) && !(top instanceof PauseScreen)) {
    const play = app.stack.find((s) => s instanceof PlayScreen);
    if (play && !G.scene.paused && top instanceof Dialog) G.scene.update(dt);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#071a42'; ctx.fillRect(0, 0, W, CH); // letterbox bands
  ctx.save(); ctx.translate(0, OY);
  if (top) top.draw(ctx);
  if (G.fx) { G.fx.update(dt); G.fx.draw(ctx); }
  drawToasts(dt);
  if (app.fade) { const f = app.fade, a = f.t < 0.25 ? f.t / 0.25 : 1 - (f.t - 0.25) / 0.25; ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0, Math.min(1, a)) + ')'; ctx.fillRect(0, -OY, W, CH); }
  ctx.restore();
  requestAnimationFrame(frame);
}

function drawToasts(dt) {
  if (!app.toasts.length) return;
  const t = app.toasts[0]; t.t += dt;
  const dur = 2.8, k = t.t < 0.3 ? t.t / 0.3 : t.t > dur - 0.3 ? (dur - t.t) / 0.3 : 1;
  const y = -90 + 110 * Math.max(0, Math.min(1, k));
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.2));
  panel(ctx, 40, y, W - 80, 80, { r: 18, fill: 'rgba(10,40,100,0.95)', stroke: '#ffd84a' });
  G.fonts.gold.draw(ctx, t.title.toUpperCase(), W / 2, y + 28, { scale: 0.5 });
  G.fonts.chat.draw(ctx, t.sub, W / 2, y + 56, { scale: 0.62 });
  ctx.restore();
  if (t.t >= dur) app.toasts.shift();
}

function toCanvas(ev) {
  const r = canvas.getBoundingClientRect();
  let fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
  if (G.pranks) [fx, fy] = G.pranks.fix(fx, fy);
  return [fx * W, fy * CH - OY];
}
let dragging = false;
let activeId = null;   // one finger plays; a second finger is ignored so it cannot press a second button
canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (dragging && ev.pointerId !== activeId) return;
  dragging = true; activeId = ev.pointerId;
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }   // keep the drag when the finger slides off the canvas
  G.audio.resume();   // iOS/Android suspend audio until (and after) a touch
  if (!G.audio.unlocked) { G.audio.unlock(); if (G.audio.musicOn) G.audio.playMusic('BoomlingsTitle.mp3', 0.5); }
  const top = app.top(); if (!top || app.fade) return;
  const [x, y] = toCanvas(ev); top.down(x, y);
});
canvas.addEventListener('pointermove', (ev) => { if (!dragging || ev.pointerId !== activeId) return; const top = app.top(); if (top && top.move) { const [x, y] = toCanvas(ev); top.move(x, y); } });
const endDrag = (ev) => { if (!dragging || ev.pointerId !== activeId) return; dragging = false; activeId = null; const top = app.top(); if (top) { const [x, y] = toCanvas(ev); top.up(x, y); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { dragging = false; activeId = null; });
// leaving the tab / app (phone call, app switch, screen off): pause a running game and silence the sound; coming back restores the sound
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { const top = app.top(); if (top instanceof PlayScreen) app.pause(); G.audio.suspend(); }
  else G.audio.resume();
});
canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); const top = app.top(); if (top && top.wheel) top.wheel(ev.deltaY); }, { passive: false });
window.addEventListener('keydown', (ev) => {
  const top = app.top();
  if (top instanceof TutorialPopup) { top.close(); return; }
  if (ev.key === 'Escape' || ev.key === 'p') { if (top instanceof PlayScreen) app.pause(); else if (top instanceof PauseScreen) app.resume(); else if (top && !(top instanceof MenuScreen) && !(top instanceof ResultsScreen)) app.back(); }
});

boot();
