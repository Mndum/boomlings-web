// Live view + pranks for the private server. A signed-in player keeps a WebSocket open to the server's live room:
// it reports its screen/score, streams frames of the game canvas while an admin is watching, and receives pranks instantly.
// Every prank is cosmetic and times out by itself; nothing touches the save. Without the backend nothing happens.
const MAX_SECONDS = 30, FRAME_MS = 250;   // 4 frames per second while watched
const TXT = (s, n) => String(s || '').slice(0, n);

export class Pranks {
  constructor(G, app, canvas, W, CH) {
    this.G = G; this.app = app; this.canvas = canvas; this.W = W; this.CH = CH;
    this.fx = {}; this.flipX = false; this.flipY = false;
    this.ws = null; this.retry = 1000; this.streaming = false; this.lastSig = '';
    this.thumb = document.createElement('canvas'); this.thumb.width = 240; this.thumb.height = 400;
    this.tctx = this.thumb.getContext('2d');
  }
  start() { if (this.timer) return; this.timer = setInterval(() => this.tick(), 1000); this.connect(); }
  tick() {
    const api = this.G.api, signed = api && api.signedIn;
    if (signed && (!this.ws || this.ws.readyState > 1) && !this.connecting) this.connect();
    if (!signed && this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } }
    if (this.ws && this.ws.readyState === 1) {   // state: whenever it changed, and at least every 5 s
      const st = this.state(), sig = JSON.stringify(st);
      if (sig !== this.lastSig || Date.now() - (this.lastSend || 0) > 5000) { this.lastSig = sig; this.lastSend = Date.now(); this.ws.send(JSON.stringify({ t: 'state', state: st })); }
    }
  }
  connect() {
    const api = this.G.api; if (!api || !api.signedIn || this.connecting) return;
    this.connecting = true;
    let ws; try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/ws', [api.token]); } catch (e) { this.connecting = false; return; }
    this.ws = ws;
    ws.onopen = () => { this.connecting = false; this.retry = 1000; this.lastSig = ''; this.tick(); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'stream') this.stream(m.on); else if (m.t === 'prank') this.run(m); };
    ws.onclose = () => { this.connecting = false; this.stream(false); this.ws = null; };
    ws.onerror = () => { this.connecting = false; };
  }
  screenName() { const t = this.app.top && this.app.top(), n = (t && t.constructor && t.constructor.name) || '?'; return n.replace(/Screen$/, ''); }
  state() {
    const sc = this.G.scene, sv = this.G.save && this.G.save.d, playing = this.screenName() === 'Play' && sc;
    return { screen: this.screenName(), score: playing ? Math.floor(sc.score || 0) : 0, level: playing ? sc.level || 0 : 0, gold: sv ? sv.gold : 0, rank: sv ? sv.rank : 0, effects: Object.keys(this.fx) };
  }
  // frames only while somebody watches
  stream(on) {
    if (on === this.streaming) return; this.streaming = on; clearInterval(this.frameTimer);
    if (on) this.frameTimer = setInterval(() => this.frame(), FRAME_MS);
  }
  frame() {
    const ws = this.ws; if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 200000) return;   // skip a frame when the connection is behind
    try { this.tctx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, 0, 240, 400); ws.send(JSON.stringify({ t: 'frame', d: this.thumb.toDataURL('image/jpeg', 0.6) })); } catch (e) { /* tainted or closed */ }
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
  // CSS on the canvas element; flips are compensated in fix() so taps still land where they are drawn
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
    clearInterval(this.anim);
    if (on('wobble') || on('rainbow')) this.anim = setInterval(() => {
      const x = performance.now() / 1000; s.setProperty('--wob', Math.sin(x * 3) * 6 + 'deg'); s.setProperty('--hue', (x * 180) % 360 + 'deg');
      if (!on('wobble') && !on('rainbow')) { clearInterval(this.anim); this.apply(); }
    }, 50);
  }
  // map a point on the (possibly flipped) canvas element back to game space
  fix(fx, fy) { if (this.flipY) { fx = 1 - fx; fy = 1 - fy; } if (this.flipX) fx = 1 - fx; return [fx, fy]; }
}
