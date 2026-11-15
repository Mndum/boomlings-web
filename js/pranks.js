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
    if (signed && (!this.ws || this.ws.readyState > 1) && !this.connecting && Date.now() >= (this.nextTry || 0)) this.connect();
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
    ws.onopen = () => { this.connecting = false; this.retry = 1000; this.nextTry = 0; this.lastSig = ''; this.tick(); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'stream') this.stream(m.on); else if (m.t === 'prank') this.run(m); };
    ws.onclose = () => { this.connecting = false; this.stream(false); this.ws = null; this.nextTry = Date.now() + this.retry; this.retry = Math.min(60000, this.retry * 2); };
    ws.onerror = () => { this.connecting = false; };
  }
  screenName() { const t = this.app.top && this.app.top(), n = (t && t.constructor && t.constructor.name) || '?'; return n.replace(/Screen$/, ''); }
  state() {
    const sc = this.G.scene, sv = this.G.save && this.G.save.d, playing = this.screenName() === 'Play' && sc;
    return { screen: this.screenName(), score: playing ? Math.floor(sc.score || 0) : 0, level: playing ? sc.level || 0 : 0, gold: sv ? sv.gold : 0, rank: sv ? sv.rank : 0, icon: sv ? sv.icon : '', effects: Object.keys(this.fx) };
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
      case 'speak': try { const u = new SpeechSynthesisUtterance(TXT(p.text2, 140) || 'Hello there'); u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no speech on this device */ } return;
      case 'vibrate': try { if (navigator.vibrate) navigator.vibrate(Array.from({ length: secs * 2 }, (_, i) => (i % 2 ? 150 : 250))); } catch (e) { /* ignore */ } return;
      case 'chipmunk': case 'slowmo': this.musicRate(p.type === 'chipmunk' ? 2 : 0.5, secs); return;
      case 'emojirain': this.emojiRain(secs, 'blob'); return;
      case 'bombrain': this.emojiRain(secs, 'bomb'); return;
      case 'iconrain': this.emojiRain(secs, 'icon'); return;
      case 'silence': { const au = this.G.audio, was = au.enabled, mv = au.mv; au.enabled = false; au.setMusicVol(0); setTimeout(() => { au.enabled = was; au.setMusicVol(mv); }, secs * 1000); return; }
      case 'blackout': this.overlay('<div style="font-size:64px">&#128064;</div>', Math.min(secs, 8), '#000', false); return;
      case 'jumpscare': {
        const o = this.G.obj, nm = 'MegaBomb_r_001.png', c = document.createElement('canvas'); c.width = c.height = 420;
        if (o && o.has(nm)) o.draw(c.getContext('2d'), nm, 210, 210, { scale: 400 / Math.max(...o.size(nm)) });
        this.overlay('<img src="' + c.toDataURL() + '" style="width:min(90vw,70vh);animation:jsc .12s infinite alternate"><style>@keyframes jsc{from{transform:scale(.95) rotate(-3deg)}to{transform:scale(1.08) rotate(3deg)}}</style>', 2, '#000', false);
        this.G.audio.play('bombbbb.ogg', 1); try { if (navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) { /* ignore */ } return;
      }
      case 'fakeads': {
        const n = Math.min(secs, 8);
        this.overlay('<div style="background:#fff;color:#222;border-radius:10px;padding:18px 22px;width:min(78vw,300px);text-align:center;font:16px/1.4 sans-serif;box-shadow:0 8px 30px #000a"><small style="opacity:.6">ADVERTISEMENT</small><div style="font-size:54px;margin:8px 0">&#127942;</div><b>Your game continues in <span id="adn">' + n + '</span></b><p style="margin:8px 0 0;font-size:13px;opacity:.7">Boomlings Premium: no ads, no fun!</p></div>', n, 'rgba(0,0,0,.7)', false);
        let k = n; const t = setInterval(() => { k--; const e = document.getElementById('adn'); if (e && k >= 0) e.textContent = k; else clearInterval(t); }, 1000); return;
      }
      case 'fakeoffline': this.app.netError(); return;
      case 'fakebattery': this.overlay('<div style="background:#2b2b2b;color:#eee;border-radius:14px;padding:20px;width:min(80vw,300px);font:16px/1.4 sans-serif;box-shadow:0 8px 30px #000a"><b style="font-size:19px">&#128267; Battery low: 1%</b><p style="margin:10px 0 18px;opacity:.8">Close apps to save battery. Your device will turn off soon.</p><div style="text-align:right;color:#6cf;font-weight:700"><span data-x style="cursor:pointer">OK</span></div></div>', secs, 'rgba(0,0,0,.55)', true); return;
      case 'bandit': this.app.toast('A bandit stole your gold!', '-500 gold ... just kidding', 'bombbbb.ogg'); return;
      case 'fakecrashpc': case 'fakecrash': this.overlay('<div style="background:#f0f0f0;color:#000;border:1px solid #2a6;box-shadow:0 8px 30px #000a;width:min(88vw,420px);font:14px/1.4 Segoe UI,Tahoma,sans-serif"><div style="background:#fff;padding:7px 10px;display:flex;justify-content:space-between"><span>Boomlings</span><b data-x style="cursor:pointer;padding:0 6px">X</b></div><div style="padding:18px 16px;display:flex;gap:14px;align-items:center;background:#fff"><div style="font-size:34px;color:#c00">&#9940;</div><div><b style="font-size:16px;color:#003399">Boomlings.exe has stopped working</b><br>Windows is checking for a solution to the problem...</div></div><div style="padding:10px 14px;text-align:right;background:#f0f0f0"><span data-x style="display:inline-block;border:1px solid #707070;background:#e1e1e1;padding:3px 16px;cursor:pointer">Close program</span></div></div>', secs, 'rgba(0,0,0,.45)', true); return;
      case 'fakecrashandroid': this.overlay('<div style="background:#2b2b2b;color:#eee;border-radius:14px;padding:20px;width:min(80vw,300px);font:16px/1.4 Roboto,sans-serif;box-shadow:0 8px 30px #000a"><b style="font-size:19px">Boomlings keeps stopping</b><p style="margin:10px 0 18px;opacity:.8">Do you want to close the app, or send feedback?</p><div style="text-align:right;color:#6cf;font-weight:700"><span data-x style="margin-right:22px;cursor:pointer">APP INFO</span><span data-x style="cursor:pointer">CLOSE APP</span></div></div>', secs, 'rgba(0,0,0,.55)', true); return;
      case 'fakecrashios': this.overlay('<div style="background:rgba(246,246,246,.96);color:#000;border-radius:14px;width:min(72vw,270px);text-align:center;font:-apple-system,system-ui,sans-serif;font:15px/1.35 -apple-system,system-ui,sans-serif;box-shadow:0 8px 30px #0008"><div style="padding:18px 16px 14px"><b style="font-size:17px">&#8220;Boomlings&#8221; Quit Unexpectedly</b><p style="margin:6px 0 0;font-size:13px">Do you want to send a report to the developer?</p></div><div data-x style="border-top:1px solid #c8c8c8;padding:11px;color:#007aff;cursor:pointer">Don&#8217;t Send</div><div data-x style="border-top:1px solid #c8c8c8;padding:11px;color:#007aff;font-weight:600;cursor:pointer">Send</div></div>', secs, 'rgba(0,0,0,.4)', true); return;
      case 'fakeupdate': this.overlay('<div style="text-align:center;color:#fff;font:700 20px/1.6 sans-serif"><div style="font-size:46px">⚙️</div>Installing update<br><div style="margin:14px auto;width:min(70vw,260px);height:14px;border:2px solid #fff;border-radius:9px;overflow:hidden"><div style="width:99%;height:100%;background:#4c8"></div></div><span style="font-size:16px;opacity:.8">99% - please do not close the game</span></div>', secs, '#0b1020', false); return;
      case 'fakeban': this.app.dialog('Account suspended', 'Your account was banned for being too good at Boomlings. Contact support.', [['OK', null]]); setTimeout(() => this.app.toast('Just kidding :)', 'You are not banned', 'getAch001.ogg'), 7000); return;
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
    if (on('spin')) tr.push('rotate(var(--sp, 0deg))');
    if (on('pulse')) tr.push('scale(var(--pl, 1))');
    if (on('tilt')) tr.push('rotate(9deg)');
    if (on('rainbow')) fl.push('hue-rotate(var(--hue, 0deg))');
    if (on('invert')) fl.push('invert(1)');
    if (on('gray')) fl.push('grayscale(1)');
    if (on('sepia')) fl.push('sepia(1) saturate(2)');
    if (on('blur')) fl.push('blur(3px)');
    if (on('zoomies')) fl.push('saturate(3) contrast(1.4)');
    if (on('shake')) tr.push('translate(var(--tx, 0px), var(--ty, 0px))');
    if (on('bounce')) tr.push('translateY(var(--by, 0px))');
    if (on('squish')) tr.push('scaleY(0.5)');
    if (on('drunk')) { tr.push('rotate(var(--dr, 0deg))'); fl.push('blur(var(--bl, 0px))'); }
    if (on('flicker')) fl.push('brightness(var(--br, 1))');
    if (on('nightmare')) fl.push('invert(1) hue-rotate(160deg) contrast(1.3)');
    const s = this.canvas.style; s.transform = tr.join(' '); s.filter = fl.join(' '); s.opacity = on('ghost') ? '0.3' : '';
    clearInterval(this.anim);
    const moving = ['spin', 'pulse', 'wobble', 'rainbow', 'shake', 'bounce', 'drunk', 'flicker'];
    if (moving.some(on)) this.anim = setInterval(() => {
      const x = performance.now() / 1000;
      s.setProperty('--wob', Math.sin(x * 3) * 6 + 'deg'); s.setProperty('--sp', (x * 140) % 360 + 'deg'); s.setProperty('--pl', 1 + Math.sin(x * 4) * 0.18); s.setProperty('--hue', (x * 180) % 360 + 'deg');
      s.setProperty('--tx', (Math.random() * 20 - 10) + 'px'); s.setProperty('--ty', (Math.random() * 20 - 10) + 'px');
      s.setProperty('--by', -Math.abs(Math.sin(x * 5)) * 70 + 'px');
      s.setProperty('--dr', Math.sin(x * 1.3) * 3 + 'deg'); s.setProperty('--bl', (Math.sin(x * 2) + 1) * 2 + 'px');
      s.setProperty('--br', Math.random() < 0.35 ? '0.08' : '1');
      if (!moving.some(on)) { clearInterval(this.anim); this.apply(); }
    }, 60);
  }
  // a fixed layer over the whole page for a fake system box; auto-removed (tapping a data-x button closes it early with a wink)
  overlay(html, secs, bg, closable) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;justify-content:center;background:' + bg;
    d.innerHTML = html; document.body.appendChild(d);
    const end = () => { if (d.parentNode) { d.remove(); this.app.toast('Just kidding :)', 'Nothing is wrong', 'getAch001.ogg'); } };
    if (closable) d.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', end));
    setTimeout(end, secs * 1000);
  }
  // sprites falling over the game on a pointer-transparent layer for `secs` seconds: Boomling blobs, bombs or the player icons
  emojiRain(secs, kind = 'blob') {
    const c = document.createElement('canvas'), W = (c.width = innerWidth), H = (c.height = innerHeight), x = c.getContext('2d');
    const atlas = kind === 'icon' ? this.G.icons : this.G.obj;
    c.style.cssText = 'position:fixed;top:0;left:0;z-index:39;pointer-events:none';
    document.body.appendChild(c);
    const C = ['b', 'g', 'o', 'p', 'r', 'y'];
    const names = (kind === 'icon' ? Array.from({ length: 50 }, (_, i) => 'boomIcon_' + String(i).padStart(2, '0') + '_001.png') : C.map((k) => (kind === 'bomb' ? 'Bomb_' + k + '_001.png' : 'Block_' + k + '_Charge_001.png'))).filter((n) => atlas && atlas.has(n));
    if (!names.length) { c.remove(); return; }
    const drops = Array.from({ length: 40 }, () => { const n = names[(Math.random() * names.length) | 0], px = 40 + Math.random() * 56; return { x: Math.random() * W, y: -Math.random() * H, v: 2 + Math.random() * 5, n, k: px / atlas.size(n)[0], r: Math.random() * 6, w: (Math.random() - 0.5) * 0.08 }; });
    const end = performance.now() + secs * 1000;
    const step = () => {
      x.clearRect(0, 0, W, H);
      for (const d of drops) { d.y += d.v; d.r += d.w; if (d.y > H + 60) { d.y = -60; d.x = Math.random() * W; } atlas.draw(x, d.n, d.x, d.y, { scale: d.k, rot: d.r }); }
      if (performance.now() < end) requestAnimationFrame(step); else c.remove();
    };
    requestAnimationFrame(step);
  }
  // music speed (1 = normal) for a while; re-applied twice a second in case the track restarts
  musicRate(rate, secs) {
    const au = this.G.audio, end = performance.now() + secs * 1000;
    const set = (r) => { try { if (au.music && au.music.s) au.music.s.playbackRate.value = r; } catch (e) { /* ignore */ } };
    clearInterval(this.rateTimer);
    this.rateTimer = setInterval(() => { if (performance.now() >= end) { clearInterval(this.rateTimer); set(1); } else set(rate); }, 500);
    set(rate);
  }
  // map a point on the (possibly flipped) canvas element back to game space
  fix(fx, fy) { if (this.flipY) { fx = 1 - fx; fy = 1 - fy; } if (this.flipX) fx = 1 - fx; return [fx, fy]; }
}
