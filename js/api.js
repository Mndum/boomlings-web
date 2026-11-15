// Client for the optional Cloudflare backend (server/worker.js): accounts, cloud save, leaderboard, referral codes, free gold packs.
// If the site is not served together with that Worker (plain static hosting, local dev server) the probe fails and the game stays offline.
const TOKEN_KEY = 'boomlings.token';

export class Api {
  constructor(G) {
    this.G = G; this.online = false; this.packs = null; this.user = null; this.saveBase = 0; this.timer = null;
    try { this.token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { this.token = ''; }
    G.save.onFlush = () => this.scheduleSave();
  }
  get signedIn() { return this.online && !!this.user; }
  async req(method, path, body) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(this.token ? { authorization: 'Bearer ' + this.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) { /* not our API */ }
    if (j === null) throw Object.assign(new Error('no backend'), { status: r.status, offline: true });
    if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status, body: j });
    return j;
  }
  // is there a backend at all? who am I?
  async init() {
    try { const j = await this.req('GET', 'api/iap'); this.packs = j.packs; this.cooldown = j.cooldown || 259200; this.cooldowns = j.cooldowns || {}; this.discordOn = !!j.discord; this.online = true; } catch (e) { this.online = false; return; }
    if (this.token) { try { this.user = (await this.req('GET', 'api/me')).user; this.claim().catch(() => {}); } catch (e) { if (e.status === 401) this.setToken(''); } }   // claim: gold gifted while away
  }
  setToken(t) { this.token = t; try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } if (!t) this.user = null; }
  async register(name, password, ref) { const j = await this.req('POST', 'api/register', { name, password, ref: ref || undefined }); this.setToken(j.token); this.user = j.user; return j; }
  async login(name, password) { const j = await this.req('POST', 'api/login', { name, password }); this.setToken(j.token); this.user = j.user; return j; }
  async logout() { try { await this.req('POST', 'api/logout'); } catch (e) { /* ignore */ } this.setToken(''); this.saveBase = 0; }
  // ---- Discord login: a popup runs Discord's own authorize page; the game polls until the server has the result
  async discordLogin() {
    if (!this.discordOn) throw new Error('Discord login is not set up on this server yet.');
    const w = window.open('', 'boom-discord', 'width=520,height=740');   // opened inside the tap, so the browser does not block it
    if (!w) throw new Error('Allow pop-ups to log in with Discord');
    let s; try { s = await this.req('POST', 'api/discord/start', {}); } catch (e) { w.close(); throw e; }
    w.location.href = s.url;
    const t0 = Date.now(); let closedPolls = 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      if (Date.now() - t0 > 300000) { try { w.close(); } catch (e) { /* ignore */ } throw new Error('Discord login timed out'); }
      let j;
      try { j = await this.req('POST', 'api/discord/finish', { nonce: s.nonce }); }
      catch (e) { if (e.status === 410 || e.status === 400) { try { w.close(); } catch (_) { /* ignore */ } throw e; } continue; }
      if (j.pending) { if (w.closed && ++closedPolls > 2) throw new Error('Discord login was cancelled'); continue; }
      try { w.close(); } catch (e) { /* ignore */ }
      if (j.token) this.setToken(j.token); this.user = j.user; return j;
    }
  }
  discordFriends() { return this.req('GET', 'api/discord/friends'); }
  async refresh() { this.user = (await this.req('GET', 'api/me')).user; return this.user; }

  // ---- gold the server hands out (referrals, free packs) goes straight into the local save
  take(gold) { if (gold > 0) { this.G.save.addGold(gold); this.G.audio.play('buyGold001.ogg', 0.8); } return gold; }
  // what the server hands back: coins an admin took away (wipe = set to 0, take = remove some) are applied first, then gifts are added
  applyClaim(j) {
    const sv = this.G.save; let changed = false;
    if (j.wipe) { sv.d.gold = 0; changed = true; }
    if (j.take) { sv.d.gold = Math.max(0, sv.d.gold - j.take); changed = true; }
    if (changed) sv.flush();
    return this.take(j.gold || 0);
  }
  async claim() { return this.applyClaim(await this.req('POST', 'api/claim')); }
  async redeem(code) { const j = await this.req('POST', 'api/redeem', { code }); this.applyClaim(j); return j; }
  async buyPack(pack) { const j = await this.req('POST', 'api/iap', { pack }); if (this.user) { this.user.lastIap = j.lastIap; this.user.iapCd = j.iapCd || 0; } this.applyClaim(j); return j.gold; }
  // seconds until the next free pack is allowed (0 = now)
  iapWait() { const u = this.user; return u && u.lastIap ? Math.max(0, Math.ceil(u.lastIap + (u.iapCd || this.cooldown || 259200) - Date.now() / 1000)) : 0; }   // the cooldown of the pack they took last (14 days after the 20,000 pack)
  packDays(pack) { return Math.round((this.cooldowns && this.cooldowns[pack] || this.cooldown || 259200) / 86400); }

  // ---- cloud save: the whole local save, last write wins; a stale writer gets a conflict to resolve
  isFresh() { const d = this.G.save.d; return !d.stats.games && !d.xp && d.rank <= 1 && d.gold === 0; }
  scheduleSave() { if (!this.signedIn) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.pushSave().catch(() => {}), 4000); }
  async pushSave(force = false) {
    if (!this.signedIn) return;
    try {
      const j = await this.req('PUT', 'api/save', { data: JSON.stringify(this.G.save.d), base: this.saveBase, force });
      this.saveBase = j.updatedAt; return { ok: true };
    } catch (e) { if (e.status === 409) return { conflict: true, data: e.body.data, updatedAt: e.body.updatedAt }; throw e; }
  }
  applyCloud(data, updatedAt) { const sv = this.G.save; sv.d = Object.assign(sv.d, JSON.parse(data)); this.saveBase = updatedAt; sv.resync(); sv.flushLocal(); }
  // after signing in: take the cloud save if this device is blank, push if the cloud is empty, otherwise ask
  async syncAfterLogin(app) {
    const s = await this.req('GET', 'api/save');
    if (!s.data) { this.saveBase = 0; await this.pushSave(); return 'pushed'; }
    if (this.isFresh()) { this.applyCloud(s.data, s.updatedAt); return 'pulled'; }
    this.saveBase = s.updatedAt;
    app.dialog('Cloud Save', 'A <cy>cloud save</c> exists for this account. Which one do you want to keep?', [['Use Cloud', () => this.applyCloud(s.data, s.updatedAt)], ['Keep This', () => this.pushSave(true)]]);
    return 'asked';
  }
  async submitScore(entry, run = {}) { if (!this.signedIn) return; try { await this.req('POST', 'api/score', { score: entry.score, level: entry.level, icon: entry.icon, rank: entry.rank, start: run.start, secs: run.secs, moves: run.moves }); } catch (e) { /* offline or signed out: ignore */ } }
  async leaderboard() { return this.req('GET', 'api/leaderboard?limit=50'); }
}
