// Sound effects + music through the Web Audio API (not <audio> elements), so the browser/OS media player
// (the "Boomlings - play/pause/next" overlay) never picks the game up. Unlocked by the first user gesture.
export class AudioMan {
  constructor(base) { this.base = base; this.buf = {}; this.music = null; this.musicName = null; this.enabled = true; this.musicOn = true; this.unlocked = false; this.mv = 1; this.sv = 1; this.ac = null; }
  ctx() {
    if (!this.ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { this.ac = new C(); } catch (e) { return null; } }
    return this.ac;
  }
  preload(names) { for (const n of names) this.load(n); }
  // decoded AudioBuffer promise, fetched once
  load(name) {
    if (!this.buf[name]) {
      const ac = this.ctx();
      this.buf[name] = !ac ? Promise.resolve(null) : fetch(this.base + name).then((r) => r.arrayBuffer()).then((d) => new Promise((ok, no) => ac.decodeAudioData(d, ok, no))).catch(() => null);
    }
    return this.buf[name];
  }
  play(name, vol = 1) {
    if (!this.enabled || !this.unlocked) return;
    const ac = this.ctx(); if (!ac) return;
    this.load(name).then((b) => {
      if (!b) return;
      try { const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = Math.min(1, vol * this.sv); s.connect(g); g.connect(ac.destination); s.start(0); } catch (e) { /* ignore */ }
    });
  }
  playMusic(name, vol = 0.5) {
    if (this.musicName === name && this.music) return;
    this.stopMusic();
    this.musicName = name;
    const ac = this.ctx(); if (!this.musicOn || !this.unlocked || !ac) return;
    const token = (this.token = (this.token || 0) + 1);
    this.load(name).then((b) => {
      if (!b || token !== this.token || this.musicName !== name) return;   // stopped or replaced while it was loading
      const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; s.loop = true; g.gain.value = Math.min(1, vol * this.mv); s.connect(g); g.connect(ac.destination); s.start(0);
      this.music = { s, g, baseVol: vol };
    });
  }
  setMusicVol(v) { this.mv = v; if (this.music) this.music.g.gain.value = Math.min(1, (this.music.baseVol || 0.5) * v); }
  stopMusic() {
    this.token = (this.token || 0) + 1;
    if (this.music) { try { this.music.s.stop(); this.music.s.disconnect(); } catch (e) { /* ignore */ } this.music = null; }
    this.musicName = null;
  }
  setMusicOn(on) { this.musicOn = on; if (!on) this.stopMusic(); }
  unlock() { this.unlocked = true; const ac = this.ctx(); if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); }
}
