// Boomlings web backend: accounts, cloud save, leaderboards, referral codes and free "in-app purchases".
// One Cloudflare Worker + one D1 database. The game's static files are served by the [assets] binding; only /api/* gets here.
// This is our own small JSON API (not the original game's server protocol).

import { adminHandler, adminOk } from './admin.js';

const enc = new TextEncoder();
export const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const bad = (msg, s = 400) => J({ error: msg }, s);

export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

export async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256)); // 100k is the Workers maximum
}
export const eq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const newRefCode = () => { const r = crypto.getRandomValues(new Uint8Array(8)); return [...r].map((x) => CODE_ALPHABET[x % 32]).join(''); };
export const NAME_RE = /^[A-Za-z0-9 _-]{3,12}$/;
export const now = () => Math.floor(Date.now() / 1000);

// Free "in-app purchases": every pack is granted for nothing (the packs themselves are our own choice; the store data has none)
const IAP_PACKS = { gold_1: 500, gold_2: 1200, gold_3: 3000, gold_4: 7500, gold_5: 20000 }; // art: IAPGold01..05

export async function body(req, max = 300000) {
  const t = await req.text();
  if (t.length > max) throw new Error('too large');
  return t ? JSON.parse(t) : {};
}

async function auth(req, env) {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : (req.headers.get('upgrade') === 'websocket' ? req.headers.get('sec-websocket-protocol') || '' : '');   // browsers cannot set headers on a WebSocket: the token rides in the subprotocol
  if (!tok) return null;
  return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned = 0').bind(await sha256(tok), now()).first();
}

async function newSession(env, userId) {
  const tok = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(tok), userId, now() + 90 * 86400).run();
  return tok;
}

const profile = (u, extra = {}) => ({ id: u.id, name: u.name, refCode: u.ref_code, pendingGold: Math.max(0, u.earned_gold - u.claimed_gold), lastIap: u.last_iap || 0, ...extra });
const iapCooldown = (env) => Math.round((+env.IAP_COOLDOWN_DAYS || 3) * 86400);
const remain = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.ceil((s % 3600) / 60); return d ? d + ' day' + (d > 1 ? 's' : '') + (h ? ' ' + h + ' h' : '') : h ? h + ' h ' + m + ' min' : m + ' min'; };

// hand over everything the user has earned and not yet received (atomic: only one request can win a given amount)
// returns what the game must apply to its save, in this order: wipe (coins to 0), take (remove coins), gold (add coins)
async function claimAll(env, userId) {
  const none = { gold: 0, take: 0, wipe: false };
  const u = await env.DB.prepare('SELECT earned_gold e, claimed_gold c, take_gold t, wipe_gold w FROM users WHERE id = ?').bind(userId).first();
  if (!u || (u.e <= u.c && !u.t && !u.w)) return none;
  const r = await env.DB.prepare('UPDATE users SET claimed_gold = ?, take_gold = 0, wipe_gold = 0 WHERE id = ? AND claimed_gold = ? AND take_gold = ? AND wipe_gold = ?').bind(u.e, userId, u.c, u.t, u.w).run();
  return r.meta.changes === 1 ? { gold: Math.max(0, u.e - u.c), take: u.t, wipe: !!u.w } : none;
}

const routes = {
  async 'POST /api/register'(req, env) {
    const { name, password, ref } = await body(req, 2000);
    if (typeof name !== 'string' || !NAME_RE.test(name.trim())) return bad('Name must be 3-12 letters, numbers, space, _ or -');
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) return bad('Password must be 6-100 characters');
    const nm = name.trim(), lc = nm.toLowerCase();
    if (await env.DB.prepare('SELECT 1 FROM users WHERE name_lc = ?').bind(lc).first()) return bad('That name is taken', 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPw(password, salt);
    let id = null, code;
    for (let i = 0; i < 5 && !id; i++) {
      code = newRefCode();
      try { id = (await env.DB.prepare('INSERT INTO users (name, name_lc, pw_hash, pw_salt, ref_code, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(nm, lc, hash, b64(salt), code, now()).run()).meta.last_row_id; } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; if (await env.DB.prepare('SELECT 1 FROM users WHERE name_lc = ?').bind(lc).first()) return bad('That name is taken', 409); }
    }
    if (!id) return bad('Could not create account, try again', 500);
    let redeemed = null;
    if (typeof ref === 'string' && ref.trim()) redeemed = await redeem(env, id, ref);
    const token = await newSession(env, id);
    const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return J({ token, user: profile(u), referral: redeemed });
  },

  async 'POST /api/login'(req, env) {
    const { name, password } = await body(req, 2000);
    if (typeof name !== 'string' || typeof password !== 'string') return bad('Missing name or password');
    const u = await env.DB.prepare('SELECT * FROM users WHERE name_lc = ?').bind(name.trim().toLowerCase()).first();
    // same work whether or not the account exists, so response time does not reveal names
    const h = await hashPw(password, u ? unb64(u.pw_salt) : new Uint8Array(16));
    if (!u || !eq(h, u.pw_hash)) return bad('Wrong name or password', 401);
    if (u.banned) return bad('This account is banned' + (u.ban_reason ? ': ' + u.ban_reason : ''), 403);
    return J({ token: await newSession(env, u.id), user: profile(u) });
  },

  async 'POST /api/logout'(req, env) {
    const h = req.headers.get('authorization') || '';
    if (h.startsWith('Bearer ')) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(h.slice(7))).run();
    return J({ ok: true });
  },

  async 'GET /api/me'(req, env, u) {
    const refs = await env.DB.prepare('SELECT COUNT(*) n FROM users WHERE referred_by = ?').bind(u.id).first();
    return J({ user: profile(u, { referrals: refs.n, referred: !!u.referred_by }) });
  },

  // ---- cloud save (last write wins, but a stale writer is told so instead of silently overwriting)
  async 'GET /api/save'(req, env, u) {
    const s = await env.DB.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').bind(u.id).first();
    return J(s ? { data: s.data, updatedAt: s.updated_at } : { data: null, updatedAt: 0 });
  },
  async 'PUT /api/save'(req, env, u) {
    const { data, base, force } = await body(req, 300000);
    if (typeof data !== 'string' || data.length > 250000) return bad('Save too large or invalid');
    try { JSON.parse(data); } catch (e) { return bad('Save is not valid JSON'); }
    const cur = await env.DB.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').bind(u.id).first();
    if (cur && !force && cur.updated_at > (base || 0)) return J({ conflict: true, data: cur.data, updatedAt: cur.updated_at }, 409);
    const t = now();
    await env.DB.prepare('INSERT INTO saves (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(u.id, data, t).run();
    return J({ ok: true, updatedAt: t });
  },

  // ---- leaderboards
  async 'POST /api/score'(req, env, u) {
    const { score, level, icon, rank } = await body(req, 2000);
    const sc = Math.floor(+score), lv = Math.floor(+level);
    if (!(sc >= 0 && sc <= 1e9) || !(lv >= 0 && lv <= 10000)) return bad('Invalid score');
    const rk = Math.min(60, Math.max(1, Math.floor(+rank) || 1)), ic = typeof icon === 'string' && /^kIcon_\d{3}$/.test(icon) ? icon : null;
    await env.DB.prepare('INSERT INTO scores (user_id, best_score, best_level, icon, rank, updated_at) VALUES (?1, ?2, ?3, ?4, ?6, ?5) ON CONFLICT(user_id) DO UPDATE SET best_score = MAX(best_score, ?2), best_level = MAX(best_level, ?3), icon = COALESCE(?4, icon), rank = ?6, updated_at = ?5').bind(u.id, sc, lv, ic, now(), rk).run();
    return J({ ok: true });
  },
  // ordered like the game's own local list: highest level first, then score
  async 'GET /api/leaderboard'(req, env, u) {
    const limit = Math.min(100, Math.max(1, +new URL(req.url).searchParams.get('limit') || 50));
    const rows = await env.DB.prepare('SELECT u.name AS name, s.best_score AS score, s.best_level AS level, s.icon AS icon, s.rank AS rank FROM scores s JOIN users u ON u.id = s.user_id WHERE s.best_score > 0 AND u.banned = 0 ORDER BY s.best_level DESC, s.best_score DESC, s.updated_at ASC LIMIT ?').bind(limit).all();
    let me = null;
    if (u) {
      const s = await env.DB.prepare('SELECT best_score score, best_level level FROM scores WHERE user_id = ?').bind(u.id).first();
      if (s && s.score > 0) me = { ...s, rank: 1 + (await env.DB.prepare('SELECT COUNT(*) n FROM scores s JOIN users x ON x.id = s.user_id WHERE x.banned = 0 AND (s.best_level > ?1 OR (s.best_level = ?1 AND s.best_score > ?2))').bind(s.level, s.score).first()).n };
    }
    return J({ entries: rows.results, me });
  },

  // ---- live view: heartbeat in, queued pranks out (pranks are deleted once handed over)
  async 'POST /api/live'(req, env, u) {
    const b = await body(req, 30000), t = now();
    const st = b.state && typeof b.state === 'object' ? JSON.stringify({ screen: String(b.state.screen || '').slice(0, 30), score: +b.state.score || 0, level: +b.state.level || 0, gold: +b.state.gold || 0, rank: +b.state.rank || 0, effects: Array.isArray(b.state.effects) ? b.state.effects.slice(0, 10).map(String) : [] }) : null;
    const th = typeof b.thumb === 'string' && b.thumb.startsWith('data:image/jpeg;base64,') && b.thumb.length < 20000 ? b.thumb : null;
    await env.DB.prepare('INSERT INTO live (user_id, seen, state, thumb) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET seen = ?2, state = ?3, thumb = COALESCE(?4, thumb)').bind(u.id, t, st, th).run();
    const q = await env.DB.prepare('SELECT id, data FROM pranks WHERE user_id = ? AND at > ? ORDER BY id LIMIT 10').bind(u.id, t - 120).all();
    if (q.results.length) await env.DB.prepare('DELETE FROM pranks WHERE user_id = ?').bind(u.id).run();
    return J({ pranks: q.results.map((r) => { try { return JSON.parse(r.data); } catch (e) { return null; } }).filter(Boolean) });
  },

  // ---- referral codes
  async 'POST /api/redeem'(req, env, u) {
    const { code } = await body(req, 500);
    const r = await redeem(env, u.id, code);
    return r.ok ? J({ ...r, ...(await claimAll(env, u.id)) }) : bad(r.error, r.status || 400);
  },
  async 'POST /api/claim'(req, env, u) {
    return J(await claimAll(env, u.id));
  },

  // ---- free in-app purchases: every pack is granted at no cost (our own packs, see IAP_PACKS)
  async 'GET /api/iap'(req, env) { return J({ packs: IAP_PACKS, cooldown: iapCooldown(env) }); },
  async 'POST /api/iap'(req, env, u) {
    const { pack } = await body(req, 500);
    const g = IAP_PACKS[pack];
    if (!g) return bad('Unknown pack');
    // one free pack per account per cooldown (3 days); the condition makes it atomic, so two quick taps cannot both win
    const t = now(), cd = iapCooldown(env);
    const r = await env.DB.prepare('UPDATE users SET last_iap = ?, earned_gold = earned_gold + ? WHERE id = ? AND last_iap <= ?').bind(t, g, u.id, t - cd).run();
    if (r.meta.changes !== 1) {
      const row = await env.DB.prepare('SELECT last_iap FROM users WHERE id = ?').bind(u.id).first(), left = row.last_iap + cd - t;
      return J({ error: 'You can claim free gold again in ' + remain(Math.max(60, left)) + '.', lastIap: row.last_iap, wait: left }, 429);
    }
    return J({ ok: true, lastIap: t, ...(await claimAll(env, u.id)) });
  },
};

const PUBLIC = new Set(['POST /api/register', 'POST /api/login', 'GET /api/iap']);
const OPTIONAL_AUTH = new Set(['GET /api/leaderboard']);

async function redeem(env, userId, codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return { ok: false, error: 'That code is not valid' };
  const me = await env.DB.prepare('SELECT referred_by FROM users WHERE id = ?').bind(userId).first();
  if (me.referred_by) return { ok: false, error: 'You already entered a code', status: 409 };
  const owner = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ?').bind(code).first();
  if (!owner) return { ok: false, error: 'That code does not exist', status: 404 };
  if (owner.id === userId) return { ok: false, error: 'You cannot use your own code' };
  const max = +env.REF_MAX_PER_OWNER || 50, used = (await env.DB.prepare('SELECT COUNT(*) n FROM users WHERE referred_by = ?').bind(owner.id).first()).n;
  if (used >= max) return { ok: false, error: 'That code has reached its limit', status: 409 };
  const gNew = +env.REF_REWARD_NEW || 0, gOwner = +env.REF_REWARD_OWNER || 0;
  // the "referred_by IS NULL" guard makes the redeem happen at most once even with parallel requests
  const [a] = await env.DB.batch([
    env.DB.prepare('UPDATE users SET referred_by = ?, earned_gold = earned_gold + ? WHERE id = ? AND referred_by IS NULL').bind(owner.id, gNew, userId),
  ]);
  if (a.meta.changes !== 1) return { ok: false, error: 'You already entered a code', status: 409 };
  await env.DB.prepare('UPDATE users SET earned_gold = earned_gold + ? WHERE id = ?').bind(gOwner, owner.id).run();
  return { ok: true, reward: gNew };
}

export { Hub } from './hub.js';

// live room (Durable Object): players and the admin site connect here by WebSocket
async function liveSocket(req, env, url) {
  if (req.headers.get('upgrade') !== 'websocket') return bad('Expected a WebSocket', 426);
  const hub = env.HUB.get(env.HUB.idFromName('main'));
  const h = new Headers(req.headers);
  if (url.pathname === '/api/admin/ws') {
    if (!(await adminOk({ headers: new Headers({ 'x-admin-token': req.headers.get('sec-websocket-protocol') || '' }) }, env))) return bad('Please sign in', 401);
    h.set('x-role', 'admin');
  } else {
    const u = await auth(req, env);
    if (!u) return bad('Please sign in', 401);
    h.set('x-role', 'player'); h.set('x-uid', String(u.id)); h.set('x-name', u.name);
  }
  return hub.fetch(new Request(req, { headers: h }));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), key = req.method + ' ' + url.pathname;
    if (url.pathname === '/api/ws' || url.pathname === '/api/admin/ws') return liveSocket(req, env, url);
    if (url.pathname.startsWith('/api/admin/')) return adminHandler(req, env, url);
    const fn = routes[key];
    if (!fn) return bad('Not found', 404);
    try {
      let u = null;
      if (!PUBLIC.has(key)) { u = await auth(req, env); if (!u && !OPTIONAL_AUTH.has(key)) return bad('Please sign in', 401); }
      return await fn(req, env, u);
    } catch (e) {
      if (e instanceof SyntaxError) return bad('Bad JSON');
      if (String(e.message) === 'too large') return bad('Request too large', 413);
      console.error(e);
      return bad('Server error', 500);
    }
  },
};
