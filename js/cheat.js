// Cheat detector, game side. It can only see tampering that happens in this browser, so it reports what it notices to the server (which also runs its own
// checks on every score and cloud save, see server/cheat.js) and the admin site shows it on the Cheats page. Reports are queued while signed out and
// sent after signing in. Nothing here changes how the game plays.
const QKEY = 'boomlings.cheatq', GAP = 300000;   // the same kind is reported at most once every 5 minutes

export class CheatGuard {
  constructor(G) { this.G = G; this.last = {}; this.q = []; try { this.q = JSON.parse(localStorage.getItem(QKEY) || '[]').slice(-10); } catch (e) { this.q = []; } this.lp = performance.now(); this.ld = Date.now(); this.bad = 0; this.hidden = false; }
  start() {
    const sv = this.G.save;
    if (sv.tamper) this.report('save_edited', sv.tamper);   // the save file was changed while the game was closed
    setInterval(() => this.watchGold(), 1500);
    setInterval(() => this.watchClock(), 5000);
    setInterval(() => this.flush(), 15000);
    document.addEventListener('visibilitychange', () => { this.hidden = true; });   // a window that was hidden is not measured (timers are throttled then)
    this.flush();
  }
  // coins may only go up through Save.addGold; any other rise means somebody wrote to the save in memory (console, extension, trainer)
  watchGold() {
    const sv = this.G.save, g = sv.d.gold;
    if (typeof g === 'number' && g > sv.shadowGold) this.report('gold_edit', `Gold rose from ${sv.shadowGold} to ${g} without a game reward (edited in memory).`);
    sv.shadowGold = g;
  }
  // the game timer and the system clock must tick at the same speed; a speed hack or a clock that is being moved breaks that
  watchClock() {
    const p = performance.now(), d = Date.now(), dp = p - this.lp, dd = d - this.ld; this.lp = p; this.ld = d;
    if (this.hidden || dp > 8000 || dp < 3000) { this.hidden = false; this.bad = 0; return; }
    const r = dd / dp;
    if (Math.abs(r - 1) > 0.25) { if (++this.bad >= 2) this.report('time_anomaly', `System clock ran ${r.toFixed(2)}x as fast as the game timer.`); } else this.bad = 0;
  }
  report(kind, detail) {
    const t = Date.now(); if (t - (this.last[kind] || 0) < GAP) return; this.last[kind] = t;
    this.q.push({ kind, detail: String(detail).slice(0, 300) }); this.q = this.q.slice(-10); this.save(); this.flush();
  }
  save() { try { localStorage.setItem(QKEY, JSON.stringify(this.q)); } catch (e) { /* ignore */ } }
  async flush() {
    const api = this.G.api; if (!api || !api.signedIn || !this.q.length || this.busy) return;
    this.busy = true;
    try { while (this.q.length) { const r = this.q[0]; await api.req('POST', 'api/cheat', r); this.q.shift(); this.save(); } } catch (e) { /* offline: try again later */ }
    this.busy = false;
  }
}
