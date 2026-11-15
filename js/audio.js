// Sound effects + music through the Web Audio API (not <audio> elements), so the browser/OS media player
// (the "Boomlings - play/pause/next" overlay) never picks the game up. Unlocked by the first user gesture.
export class AudioMan {
  constructor(base) { this.base = base; this.buf = {}; this.music = null; this.musicName = null; this.enabled = true; this.musicOn = true; this.unlocked = false; this.mv = 1; this.sv = 1; this.ac = null; this.haptics = true; }
  ctx() {
    if (!this.ac) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      try { this.ac = new C(); } catch (e) { return null; }
      // iPhones: play through the silent/ringer switch like a game, not like a ringtone (iOS 16.4+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    }
    return this.ac;
  }
  // iPhones (and some older Android WebViews) cannot decode .ogg: use the .mp3 copy of the same sound
  file(name) {
    if (this.ogg === undefined) { try { this.ogg = !!new Audio().canPlayType('audio/ogg; codecs="vorbis"') && !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent); } catch (e) { this.ogg = false; } }
    return this.base + (this.ogg ? name : name.replace(/\.ogg$/, '.mp3'));
  }
  preload(names) { for (const n of names) this.load(n); }
  // decoded AudioBuffer promise, fetched once
  load(name) {
    if (!this.buf[name]) {
      const ac = this.ctx();
      this.buf[name] = !ac ? Promise.resolve(null) : fetch(this.file(name)).then((r) => r.arrayBuffer()).then((d) => new Promise((ok, no) => ac.decodeAudioData(d, ok, no))).catch(() => null);
    }
    return this.buf[name];
  }
  // Haptics (Android browsers; iPhones have no vibration API): every game sound has a matching buzz, so taps, pops, blasts and rewards all feel right
  buzz(name) {
    if (!this.haptics || !navigator.vibrate || !this.unlocked) return;
    const n = name.replace(/\.(ogg|mp3)$/, '');
    let p = null;
    if (/^click/.test(n) || n === 'pause01') p = 8;
    else if (/^(pop|pops|res02|counter|spinner|starSound)/.test(n)) p = 12;
    else if (/^(stoneHit|splat|splatSound|mystery(Enter|Appear|Trigger))/.test(n)) p = 22;
    else if (n === 'chainTest01' || n === 'lightning5' || n === 'pipeenter02' || n === 'megaBeep001') p = 28;
    else if (/^(bombbbb|frostBoom2|megaExplode|megaSplat|skullEnding|megaEnter)/.test(n)) p = [60, 25, 40];
    else if (/^(alert|whoa|skullTest|showTutorial)/.test(n)) p = 30;
    else if (/^(getAch|unlock|levelComplete|lvlup|lvlPulse|highscore|buyGold|mysteryReward)/.test(n)) p = [20, 40, 30, 40, 50];
    if (p === null) return;
    const t = performance.now(); if (t - (this.lastBuzz || 0) < 30 && !Array.isArray(p)) return;   // a new buzz cancels the old one: do not stutter
    this.lastBuzz = t;
    try { navigator.vibrate(p); } catch (e) { /* not allowed */ }
  }
  play(name, vol = 1) {
    this.buzz(name);
    if (!this.enabled || !this.unlocked || this.away) return;
    const ac = this.ctx(); if (!ac || ac.state !== 'running') return;   // not allowed to make sound yet: do not queue clicks that would all burst out later
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
  // player left the app / switched app / locked the phone: mute everything and stay muted until they are back
  suspend() { this.away = true; if (this.ac && this.ac.state === 'running') this.ac.suspend().catch(() => {}); }
  back() { this.away = false; this.resume(); }
  // phones suspend (or "interrupt") the audio context when the page loses focus; any touch wakes it again
  resume() { if (!this.away && this.unlocked && this.ac && this.ac.state !== 'running') this.ac.resume().catch(() => {}); }
  // load time: start the title music straight away. Browsers keep the sound muted until the first tap/key, so it begins the moment they allow it
  auto(name, vol) { this.unlock(); this.playMusic(name, vol); }
  kick() { if (this.away) return; if (!this.ac || this.ac.state !== 'running') this.unlock(); }
  // must run inside a touch/click: resumes the context and plays one silent sample, which is what unlocks sound on iOS
  unlock() {
    this.unlocked = true; const ac = this.ctx(); if (!ac) return;
    try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch (e) { /* ignore */ }
    if (ac.state !== 'running') { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }
  }
}
