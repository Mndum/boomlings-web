// Live view + pranks for the private server: a signed-in player sends a small heartbeat (screen, score, a tiny snapshot of the game canvas)
// and picks up pranks the admin queued. Every prank is cosmetic and times out by itself; nothing touches the save.
const BEAT_MS = 3000, MAX_SECONDS = 30;
const TXT = (s, n) => String(s || '').slice(0, n);

export class Pranks {
  constructor(G, app, canvas, W, CH) {
    this.G = G; this.app = app; this.canvas = canvas; this.W = W; this.CH = CH;
    this.fx = {};            // active effects: name -> end time (ms)
    this.flipX = false; this.flipY = false;
    this.timer = null; this.beats = 0;
    this.thumb = document.createElement('canvas'); this.thumb.width = 128; this.thumb.height = 190;
  }
  start() { if (this.timer) return; this.timer = setInterval(() => this.beat().catch(() => {}), BEAT_MS); this.beat().catch(() => {}); }
  stop() { clearInterval(this.timer); this.timer = null; this.clear(); }
  screenName() {
    const a = this.app, t = a.top && a.top(), n = t && t.constructor && t.constructor.name || '?';
    return n.replace(/Screen$/, '');
  }
  snapshot() {
    try { const c = this.thumb.getContext('2d'); c.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, 0, 128, 190); return this.thumb.toDataURL('image/jpeg', 0.5); } catch (e) { return null; }
  }
  async beat() {
    const api = this.G.api;
    if (!api || !api.signedIn || document.hidden) return;
    const sc = this.G.scene, sv = this.G.save && this.G.save.d;
    const playing = this.app.top && this.app.top().constructor.name === 'PlayScreen' && sc;
    const state = { screen: this.screenName(), score: playing ? Math.floor(sc.score || 0) : 0, level: playing ? sc.level || 0 : 0, gold: sv ? sv.gold : 0, rank: sv ? sv.rank : 0, effects: Object.keys(this.fx) };
    const j = await api.req('POST', 'api/live', { state, thumb: this.snapshot() });
    (j.pranks || []).forEach((p) => this.run(p));
  }
  run(p) {
    const secs = Math.max(2, Math.min(MAX_SECONDS, +p.secs || 10)), end = performance.now() + secs * 1000;
    switch (p.type) {
      case 'message': this.app.dialog(TXT(p.text, 40) || 'Hello!', TXT(p.text2, 140) || 'Somebody is watching you...', [['OK', null]]); return;
      case 'toast': this.app.toast(TXT(p.text, 30) || 'Surprise!', TXT(p.text2, 40) || 'Hee hee', 'getAch001.ogg'); return;
      case 'sound': { let n = 0; const t = setInterval(() => { this.G.audio.play(['click08.ogg', 'getAch001.ogg', 'unlock004.ogg', 'highscoreGet02.ogg'][n++ % 4], 0.6); if (n >= secs) clearInterval(t); }, 1000); return; }
      case 'fakegold': this.app.toast('+1,000,000 gold!', 'Just kidding :)', 'buyGold001.ogg'); return;
      default: this.fx[p.type] = end; this.apply(); setTimeout(() => this.apply(), secs * 1000 + 60);
    }
  }
  // CSS on the canvas element; flips are compensated in toCanvas() so taps still land where they are drawn
  apply() {
    const t = performance.now(), on = (k) => (this.fx[k] || 0) > t;
    for (const k of Object.keys(this.fx)) if (!on(k)) delete this.fx[k];
    const tr = [], fl = [];
    this.flipY = on('flip'); this.flipX = on('mirror');
    if (this.flipY) tr.push('rotate(180deg)');
    if (this.flipX) tr.push('scaleX(-1)');
    if (on('tiny')) tr.push('scale(0.55)');
    if (on('wobble')) tr.push('rotate(var(--wob, 0deg))');
    if (on('rainbow')) fl.push('hue-rotate(var(--hue, 0deg))');
    if (on('invert')) fl.push('invert(1)');
    if (on('gray')) fl.push('grayscale(1)');
    if (on('sepia')) fl.push('sepia(1) saturate(2)');
    if (on('blur')) fl.push('blur(3px)');
    if (on('zoomies')) fl.push('saturate(3) contrast(1.4)');
    const s = this.canvas.style; s.transform = tr.join(' '); s.filter = fl.join(' ');
    // the flip rotate(180deg) already inverts both axes; the mirror flips x again
    clearInterval(this.anim);
    if (on('wobble') || on('rainbow')) this.anim = setInterval(() => {
      const x = performance.now() / 1000; s.setProperty('--wob', Math.sin(x * 3) * 6 + 'deg'); s.setProperty('--hue', (x * 180) % 360 + 'deg');
      if (!on('wobble') && !on('rainbow')) { clearInterval(this.anim); this.apply(); }
    }, 50);
  }
  clear() { this.fx = {}; this.apply(); }
  // map a screen point to the canvas, undoing any flip
  fix(fx, fy) { const net = this.flipY ? -1 : 1; if (this.flipY) { fx = 1 - fx; fy = 1 - fy; } if (this.flipX) fx = 1 - fx; return [fx, fy, net]; }
}
