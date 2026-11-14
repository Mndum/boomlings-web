import { parsePlist, fetchText } from './plist.js';
import { POW_TAGS } from './save.js';

// The 60 achievements from AchievementsDesc.plist, with progress tracking driven by game events.
export class Ach {
  constructor(defs, save) {
    this.save = save; this.store = null; this.onUnlock = null;
    this.list = Object.entries(defs).map(([id, v]) => ({ id, title: v.title, todo: v.unachievedDescription, done: v.achievedDescription, points: +v.maxiumPoints, order: +v.order, hidden: !!v.hidden }))
      .sort((a, b) => a.order - b.order);
    this.byId = Object.fromEntries(this.list.map((a) => [a.id, a]));
  }
  static async load(save) { return new Ach(parsePlist(await fetchText('assets/AchievementsDesc.plist')), save); }
  isDone(id) { return (this.save.d.ach[id] || 0) >= 100; }
  percent(id) { return Math.min(100, this.save.d.ach[id] || 0); }
  report(id, pct = 100) {
    const a = this.byId[id]; if (!a) return;
    const cur = this.save.d.ach[id] || 0;
    if (cur >= 100 || pct <= cur) return;
    this.save.d.ach[id] = Math.min(100, pct);
    if (this.save.d.ach[id] >= 100) {
      this.save.flush();
      if (this.onUnlock) this.onUnlock(a);
      if (this.store) { const ic = this.store.unlockIconByAch(id); if (ic && this.onIconUnlock) this.onIconUnlock(ic); }
    }
  }
  // count-based achievements: thresholds map to ids
  count(stat, n, tiers) { // tiers: [[threshold, id], ...]
    const total = this.save.inc(stat, n);
    for (const [t, id] of tiers) this.report(id, Math.floor(Math.min(100, (total / t) * 100)));
    this.save.flush();
  }
  get totalPoints() { return this.list.reduce((s, a) => s + (this.isDone(a.id) ? a.points : 0), 0); }
  get maxPoints() { return this.list.reduce((s, a) => s + a.points, 0); }

  // ---- event hooks called by the game ----
  onLevel(level, ctx) {
    for (const l of [5, 10, 15, 20]) if (level >= l) this.report('boomlings.ach.level.' + l);
    if (level >= 5 && ctx.noBombs) this.report('boomlings.ach.pacifist');
    if (level >= 5 && ctx.onlyCombos) this.report('boomlings.ach.combocat');
    if (level === 10 && !ctx.shortcut) {
      const t = ctx.time;
      if (t <= 1200) this.report('boomlings.ach.turtle.1');
      if (t <= 900) this.report('boomlings.ach.turtle.2');
      if (t <= 600) this.report('boomlings.ach.turtle.3');
      if (t <= 480) this.report('boomlings.ach.turtle.4');
    }
  }
  onChain(chainId, len) {
    if (chainId > 2) this.report('boomlings.ach.chain.3');
    if (chainId > 4) this.report('boomlings.ach.chain.5');
    if (chainId > 6) this.report('boomlings.ach.chain.7');
    if (len >= 10) this.report('boomlings.ach.nodes.A');
    if (len >= 20) this.report('boomlings.ach.nodes.B');
    if (len >= 30) this.report('boomlings.ach.nodes.C');
  }
  onBombsInTurn(n) { if (n >= 5) this.report('boomlings.ach.bombs.1'); if (n >= 10) this.report('boomlings.ach.bombs.2'); }
  onColorsInTurn(n) { if (n >= 4) this.report('boomlings.ach.colors.2'); if (n >= 6) this.report('boomlings.ach.colors.3'); }
  onDestroyed(attr) {
    const T = (a, b, c, id) => [[a, 'boomlings.ach.' + id + '.A'], [b, 'boomlings.ach.' + id + '.B'], [c, 'boomlings.ach.' + id + '.C']];
    if (attr === 11) this.count('changer', 1, T(50, 100, 200, 'changer'));
    else if (attr === 7) this.count('skull', 1, T(100, 500, 1000, 'skull'));
    else if (attr === 8) this.count('stone', 1, T(50, 200, 500, 'stone'));
    else if (attr === 2) { this.report('boomlings.ach.firstMegaBomb'); this.count('megabomb', 1, T(10, 50, 100, 'megabomb')); }
  }
  onMegaBlobPopped() { this.report('boomlings.ach.firstMegaBlob'); this.count('megablob', 1, [[10, 'boomlings.ach.megablob.A'], [50, 'boomlings.ach.megablob.B'], [100, 'boomlings.ach.megablob.C']]); }
  onMystery() { this.count('mystery', 1, [[10, 'boomlings.ach.mystery.A'], [50, 'boomlings.ach.mystery.B'], [100, 'boomlings.ach.mystery.C']]); }
  onBandits(n) { if (n >= 3) this.report('boomlings.ach.4bandits'); }
  onGold(total) { for (const [t, id] of [[1000, 'gold.1'], [5000, 'gold.2'], [10000, 'gold.3']]) this.report('boomlings.ach.' + id, Math.floor(Math.min(100, total / t * 100))); }
  onRank(rank) { for (const [r, id] of [[5, 'rank.1'], [10, 'rank.2'], [15, 'rank.3'], [20, 'rank.4']]) if (rank >= r) this.report('boomlings.ach.' + id); }
  onPowBought(rank) {
    this.report('boomlings.ach.pow.A');
    if (rank >= 3) this.report('boomlings.ach.pow.B');
    const all = this.store && this.store.pows.every((p) => this.save.powRank(p.tag) >= p.ranks.length);
    if (all) this.report('boomlings.ach.pow.C');
  }
  onIconCollected(purchased) {
    if (purchased) this.report('boomlings.ach.icon.A');
    const n = this.save.d.icons.length;
    for (const [c, id] of [[20, 'icon.1'], [30, 'icon.2'], [40, 'icon.3'], [50, 'icon']]) if (n >= c) this.report('boomlings.ach.' + id);
  }
}
