// Persistent player state (localStorage). Everything the original kept in its .dat save files.
const KEY = 'boomlings.save.v2';

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
      delete this.d.dailyDay; // old test field: the streak now lives in dailyCount only
      // migrate v1 best score
      const old = +(localStorage.getItem('boomlings.best') || 0);
      if (old && !this.d.best) this.d.best = old;
    } catch (e) { /* storage unavailable: run in memory */ }
  }
  reset() { this.d = defaults(); this.flush(); }
  flushLocal() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* ignore */ } }
  flush() { this.flushLocal(); if (this.onFlush) this.onFlush(); }   // onFlush: the cloud-save hook (api.js)
  seen(k) { return !!(this.d.tut && this.d.tut[k]); }
  markSeen(k) { this.d.tut = this.d.tut || {}; this.d.tut[k] = 1; this.flush(); }
  get gold() { return this.d.gold; }
  addGold(n) { this.d.gold = Math.max(0, this.d.gold + n); this.flush(); }
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
