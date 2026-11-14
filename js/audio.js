// Sound effects + music. Uses HTMLAudioElement clones; unlocked by the first user gesture.
export class AudioMan {
  constructor(base) { this.base = base; this.cache = {}; this.music = null; this.musicName = null; this.enabled = true; this.musicOn = true; this.unlocked = false; this.mv = 1; this.sv = 1; }
  preload(names) { for (const n of names) this.get(n); }
  get(name) {
    if (!this.cache[name]) { const a = new Audio(this.base + name); a.preload = 'auto'; this.cache[name] = a; }
    return this.cache[name];
  }
  play(name, vol = 1) {
    if (!this.enabled || !this.unlocked) return;
    try { const a = this.get(name).cloneNode(); a.volume = Math.min(1, vol * this.sv); a.play().catch(() => {}); } catch (e) { /* ignore */ }
  }
  playMusic(name, vol = 0.5) {
    if (this.musicName === name && this.music && !this.music.paused) return;
    this.stopMusic();
    this.musicName = name;
    if (!this.musicOn || !this.unlocked) return;
    const a = new Audio(this.base + name); a.loop = true; a.volume = Math.min(1, vol * this.mv); a.baseVol = vol; this.music = a; a.play().catch(() => {});
  }
  setMusicVol(v) { this.mv = v; if (this.music) this.music.volume = Math.min(1, (this.music.baseVol || 0.5) * v); }
  stopMusic() { if (this.music) { this.music.pause(); this.music = null; } this.musicName = null; }
  setMusicOn(on) { this.musicOn = on; if (!on) this.stopMusic(); }
  unlock() { this.unlocked = true; }
}
