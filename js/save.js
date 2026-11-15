// Persistent player state (localStorage). Everything the original kept in its .dat save files.
const KEY = 'boomlings.save.v2', SEAL = 'boomlings.seal';
// a fingerprint of the numbers worth cheating on, written with every save: if the save file is edited while the game is closed it no longer matches
const seal = (d) => { const t = [d.gold, d.xp, d.rank, d.best, d.stats && d.stats.kSGold, d.stats && d.stats.games, 'bm7'].join('|'); let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

export const FREE_ICONS = ['kIcon_001', 'kIcon_002', 'kIcon_003', 'kIcon_004', 'kIcon_005', 'kIcon_006'];
export const POW_TAGS = ['kPowBOOM', 'kPowBombM', 'kPowColorM', 'kPowGreed', 'kPowLevelSkip', 'kPowSkullBlast', 'kPowTimeBoost', 'kPowTimeFreeze'];

function defaults() {
  return {
    gold: 0, xp: 0, rank: 1, name: 'Player', icon: 'kIcon_001', icons: FREE_ICONS.slice(),
    pow: {},            // tag -> owned rank (0..3)
    slots: 0,           // powerup slots owned (0..3)
    equipped: [null, null, null],
    items: { kItemRes: 0, kItemSkip: 0, kItemSkipB: 0, kItemSkipC: 0 },
    stats: {}, ach: {}, scores: [], best: 0, loose: 0,
    opts: { music: true, sfx: true }, daily: '', seenTut: false, tut: {},
  };
}

export class Save {
  constructor() {
    this.d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.d = Object.assign(defaults(), JSON.parse(raw));
      const sl = localStorage.getItem(SEAL);
      if (raw && sl && sl !== seal(this.d)) this.tamper = 'The save file was edited outside the game (gold ' + this.d.gold + ', rank ' + this.d.rank + ', best score ' + this.d.best + ').';
      delete this.d.dailyDay; // old test field: the streak now lives in dailyCount only
      // migrate v1 best score
      const old = +(localStorage.getItem('boomlings.best') || 0);
      if (old && !this.d.best) this.d.best = old;
    } catch (e) { /* storage unavailable: run in memory */ }
    this.shadowGold = this.d.gold;
  }
  resync() { this.shadowGold = this.d.gold; }   // a save that was loaded on purpose (cloud save): not a cheat
  reset() { this.d = defaults(); this.resync(); this.flush(); }
  flushLocal() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); localStorage.setItem(SEAL, seal(this.d)); } catch (e) { /* ignore */ } }
  flush() { this.flushLocal(); if (this.onFlush) this.onFlush(); }   // onFlush: the cloud-save hook (api.js)
  seen(k) { return !!(this.d.tut && this.d.tut[k]); }
  markSeen(k) { this.d.tut = this.d.tut || {}; this.d.tut[k] = 1; this.flush(); }
  get gold() { return this.d.gold; }
  addGold(n) { this.d.gold = Math.max(0, this.d.gold + n); if (this.d.gold > this.shadowGold) this.shadowGold = this.d.gold; this.flush(); }   // the only legal way for coins to go up
  stat(k, d = 0) { return this.d.stats[k] || d; }
  inc(k, n = 1) { this.d.stats[k] = (this.d.stats[k] || 0) + n; return this.d.stats[k]; }
  setMax(k, v) { if (v > (this.d.stats[k] || 0)) this.d.stats[k] = v; }
  powRank(tag) { return this.d.pow[tag] || 0; }
  // rank of a powerup only counts while it is equipped in a slot (as in the original)
  activeRank(tag) { return this.d.equipped.includes(tag) ? this.powRank(tag) : 0; }
  hasIcon(id) { return this.d.icons.includes(id); }
  // Add a score to the local leaderboard (ordered like GameManager::getScoreForLevel: level first, then score)
  addScore(entry) {
    this.d.scores.push(entry);
    this.d.scores.sort((a, b) => (b.level * 1e7 + b.score) - (a.level * 1e7 + a.score));
    this.d.scores = this.d.scores.slice(0, 50);
    this.flush();
    return this.d.scores.indexOf(entry);
  }
}
