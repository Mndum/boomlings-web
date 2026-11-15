// Boomlings web backend: accounts, cloud save, leaderboards, referral codes and free "in-app purchases".
// One Cloudflare Worker + one D1 database. The game's static files are served by the [assets] binding; only /api/* gets here.
// This is our own small JSON API (not the original game's server protocol).

import { adminHandler, adminOk } from './admin.js';
import { checkSave, checkScore, clientReport } from './cheat.js';

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

const profile = (u, extra = {}) => ({ id: u.id, name: u.name, refCode: u.ref_code, pendingGold: Math.max(0, u.earned_gold - u.claimed_gold), lastIap: u.last_iap || 0, iapCd: u.iap_cd || 0, discord: !!u.discord_id, ...extra });
const iapCooldown = (env) => Math.round((+env.IAP_COOLDOWN_DAYS || 3) * 86400);
// the biggest pack (20,000 gold) keeps the next free pack away for 2 weeks; the others use the normal cooldown
const IAP_LONG = { gold_5: 14 * 86400 };
const packCooldown = (env, pack) => IAP_LONG[pack] || iapCooldown(env);
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
    await checkSave(env, u, data);   // cheat detector: compare with the previous upload
    return J({ ok: true, updatedAt: t });
  },
  async 'POST /api/cheat'(req, env, u) { return clientReport(req, env, u, body); },   // the game reports tampering it notices

  // ---- leaderboards
  async 'POST /api/score'(req, env, u) {
    const { score, level, icon, rank, start, secs, moves } = await body(req, 2000);
    const sc = Math.floor(+score), lv = Math.floor(+level);
    if (!(sc >= 0 && sc <= 1e9) || !(lv >= 0 && lv <= 10000)) return bad('Invalid score');
    const rk = Math.min(60, Math.max(1, Math.floor(+rank) || 1)), ic = typeof icon === 'string' && /^kIcon_\d{3}$/.test(icon) ? icon : null;
    await env.DB.prepare('INSERT INTO scores (user_id, best_score, best_level, icon, rank, updated_at) VALUES (?1, ?2, ?3, ?4, ?6, ?5) ON CONFLICT(user_id) DO UPDATE SET best_score = MAX(best_score, ?2), best_level = MAX(best_level, ?3), icon = COALESCE(?4, icon), rank = ?6, updated_at = ?5').bind(u.id, sc, lv, ic, now(), rk).run();
    await checkScore(env, u, { score: sc, level: lv, start: Math.floor(+start) || 1, secs: +secs || 0, moves: Math.floor(+moves) || 0 });
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

  // ---- public reviews (the /rate/ page): no sign-in; one review per browser id, at most 5 per IP per day
  async 'GET /api/ratings'(req, env) {
    const [agg, dist, rows] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) n, AVG(stars) avg FROM ratings').first(),
      env.DB.prepare('SELECT stars, COUNT(*) n FROM ratings GROUP BY stars').all(),
      env.DB.prepare("SELECT name, stars, comment, at FROM ratings WHERE comment IS NOT NULL AND comment != '' ORDER BY at DESC LIMIT 30").all(),
    ]);
    const d = [0, 0, 0, 0, 0]; dist.results.forEach((r) => { if (r.stars >= 1 && r.stars <= 5) d[r.stars - 1] = r.n; });
    return J({ count: agg.n, average: agg.n ? Math.round(agg.avg * 10) / 10 : 0, distribution: d, reviews: rows.results });
  },
  async 'POST /api/rate'(req, env) {
    const b = await body(req, 3000), stars = Math.floor(+b.stars);
    if (!(stars >= 1 && stars <= 5)) return bad('Pick 1 to 5 stars');
    const cid = String(b.cid || ''); if (!/^[a-f0-9]{32}$/.test(cid)) return bad('Bad request');
    const name = String(b.name || '').replace(/[<>]/g, '').trim().slice(0, 20), comment = String(b.comment || '').replace(/[<>]/g, '').trim().slice(0, 500);
    const ip = await sha256((req.headers.get('cf-connecting-ip') || 'local') + '|boomlings'), t = now();
    const mine = await env.DB.prepare('SELECT 1 FROM ratings WHERE cid = ?').bind(cid).first();
    if (!mine && (await env.DB.prepare('SELECT COUNT(*) n FROM ratings WHERE ip_hash = ? AND at > ?').bind(ip, t - 86400).first()).n >= 5) return bad('Too many reviews from this connection today. Try again tomorrow.', 429);
    await env.DB.prepare('INSERT INTO ratings (cid, stars, name, comment, at, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(cid) DO UPDATE SET stars = ?2, name = ?3, comment = ?4, at = ?5').bind(cid, stars, name || null, comment || null, t, ip).run();
    return J({ ok: true });
  },

  // ---- Discord login + friends leaderboard (players who share a Discord server).
  // Needs DISCORD_CLIENT_ID (var) and DISCORD_CLIENT_SECRET (secret); optional DISCORD_GUILD_ID limits "friends" to that one server.
  async 'POST /api/discord/start'(req, env, u) {
    if (!discordOn(env)) return bad('Discord login is not set up on this server yet.', 503);
    const nonce = hex(crypto.getRandomValues(new Uint8Array(16))), origin = new URL(req.url).origin;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM discord_states WHERE created_at < ?').bind(now() - 900),
      env.DB.prepare('INSERT INTO discord_states (nonce, user_id, created_at) VALUES (?, ?, ?)').bind(nonce, u ? u.id : null, now()),
    ]);
    const url = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: origin + '/api/discord/callback', scope: 'identify guilds', state: nonce, prompt: 'none' });
    // the cookie ties the login to THIS browser, so nobody can finish a login they started for someone else
    return new Response(JSON.stringify({ nonce, url }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': 'dc_state=' + nonce + '; Path=/api/discord; Max-Age=900; HttpOnly; SameSite=Lax' + (origin.startsWith('https') ? '; Secure' : '') } });
  },
  async 'GET /api/discord/callback'(req, env) {
    const url = new URL(req.url), code = url.searchParams.get('code'), nonce = url.searchParams.get('state') || '';
    const page = (msg, ok) => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Boomlings</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b3a86;color:#fff;font:700 20px system-ui,sans-serif;text-align:center;padding:20px"><div>' + (ok ? '✔ ' : '') + msg + '<p style="font:500 14px system-ui;opacity:.8">You can close this window and go back to the game.</p></div><script>setTimeout(function(){window.close()},ok?1500:6000)</script>', { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' } });
    const cookie = (req.headers.get('cookie') || '').match(/(?:^|;\s*)dc_state=([a-f0-9]{32})/);
    const st = /^[a-f0-9]{32}$/.test(nonce) && cookie && cookie[1] === nonce ? await env.DB.prepare('SELECT * FROM discord_states WHERE nonce = ? AND created_at > ? AND status IS NULL').bind(nonce, now() - 900).first() : null;
    if (!st) return page('This login link is not valid any more. Start the login again from the game.');
    const fail = async (msg) => { await env.DB.prepare("UPDATE discord_states SET status = 'error', error = ? WHERE nonce = ?").bind(msg, nonce).run(); return page(msg); };
    if (!code) return fail('Discord login was cancelled.');
    const dc = await discordProfile(env, code, url.origin + '/api/discord/callback');
    if (!dc || dc.error) return fail('Discord did not accept that login' + (dc && dc.error ? ' (' + dc.error + ')' : '') + '. Try again.');
    const guilds = JSON.stringify(env.DISCORD_GUILD_ID ? dc.guilds.filter((g) => g === String(env.DISCORD_GUILD_ID)) : dc.guilds.slice(0, 300));
    const owner = await env.DB.prepare('SELECT * FROM users WHERE discord_id = ?').bind(dc.id).first();
    let uid, kind;
    if (st.user_id) {   // signed in already: link this Discord account to the player
      if (owner && owner.id !== st.user_id) return fail('That Discord account is already linked to another player.');
      await env.DB.prepare('UPDATE users SET discord_id = ?, discord_guilds = ? WHERE id = ?').bind(dc.id, guilds, st.user_id).run();
      uid = st.user_id; kind = 'linked';
    } else if (owner) {
      if (owner.banned) return fail('This account is banned' + (owner.ban_reason ? ': ' + owner.ban_reason : ''));
      await env.DB.prepare('UPDATE users SET discord_guilds = ? WHERE id = ?').bind(guilds, owner.id).run();
      uid = owner.id; kind = 'login';
    } else {   // first time: make an account from the Discord name, with a random password (they sign in with Discord)
      const salt = crypto.getRandomValues(new Uint8Array(16)), hash = await hashPw(hex(crypto.getRandomValues(new Uint8Array(24))), salt);
      for (let i = 0; i < 8 && !uid; i++) {
        const nm = dcName(dc.name, i), lc = nm.toLowerCase();
        if (await env.DB.prepare('SELECT 1 FROM users WHERE name_lc = ?').bind(lc).first()) continue;
        try { uid = (await env.DB.prepare('INSERT INTO users (name, name_lc, pw_hash, pw_salt, ref_code, created_at, discord_id, discord_guilds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(nm, lc, hash, b64(salt), newRefCode(), now(), dc.id, guilds).run()).meta.last_row_id; } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; }
      }
      if (!uid) return fail('Could not create the account. Try again.');
      kind = 'created';
    }
    await env.DB.prepare('UPDATE discord_states SET status = ?, result_id = ? WHERE nonce = ?').bind(kind, uid, nonce).run();
    return page('Connected to Discord!', true);
  },
  // the game polls this until the popup has finished; the one-time nonce is only known to the browser that started the login
  async 'POST /api/discord/finish'(req, env) {
    const { nonce } = await body(req, 300);
    const cookie = (req.headers.get('cookie') || '').match(/(?:^|;\s*)dc_state=([a-f0-9]{32})/);
    if (typeof nonce !== 'string' || !cookie || cookie[1] !== nonce) return bad('Login expired', 410);
    const st = await env.DB.prepare('SELECT * FROM discord_states WHERE nonce = ? AND created_at > ?').bind(nonce, now() - 900).first();
    if (!st) return bad('Login expired', 410);
    if (!st.status) return J({ pending: true });
    await env.DB.prepare('DELETE FROM discord_states WHERE nonce = ?').bind(nonce).run();
    if (st.status === 'error') return bad(st.error || 'Discord login failed', 400);
    const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(st.result_id).first();
    if (st.status === 'linked') return J({ token: null, linked: true, user: profile(u) });
    return J({ token: await newSession(env, u.id), user: profile(u), created: st.status === 'created' });
  },
  // scores of the players who share a Discord server with this player (and their own), ordered like the global list
  async 'GET /api/discord/friends'(req, env, u) {
    if (!u.discord_id) return bad('Log in with Discord first', 409);
    let mine = []; try { mine = JSON.parse(u.discord_guilds || '[]').map(String).slice(0, 90); } catch (e) { /* none */ }
    const q = mine.map(() => '?').join(',');
    const rows = await env.DB.prepare('SELECT u.name AS name, s.best_score AS score, s.best_level AS level, s.icon AS icon, s.rank AS rank FROM scores s JOIN users u ON u.id = s.user_id WHERE s.best_score > 0 AND u.banned = 0 AND (u.id = ?' + (mine.length ? ' OR EXISTS (SELECT 1 FROM json_each(u.discord_guilds) j WHERE j.value IN (' + q + '))' : '') + ') ORDER BY s.best_level DESC, s.best_score DESC LIMIT 100').bind(u.id, ...mine).all();
    return J({ entries: rows.results, me: null });
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
  async 'GET /api/iap'(req, env) { return J({ packs: IAP_PACKS, cooldown: iapCooldown(env), cooldowns: Object.fromEntries(Object.keys(IAP_PACKS).map((k) => [k, packCooldown(env, k)])), discord: discordOn(env) }); },
  async 'POST /api/iap'(req, env, u) {
    const { pack } = await body(req, 500);
    const g = IAP_PACKS[pack];
    if (!g) return bad('Unknown pack');
    // one free pack per account per cooldown (3 days, or 14 days after the 20,000 pack); the condition makes it atomic, so two quick taps cannot both win
    const t = now(), base = iapCooldown(env), cd = packCooldown(env, pack);
    const r = await env.DB.prepare('UPDATE users SET last_iap = ?1, iap_cd = ?2, earned_gold = earned_gold + ?3 WHERE id = ?4 AND last_iap + CASE WHEN iap_cd > 0 THEN iap_cd ELSE ?5 END <= ?1').bind(t, cd, g, u.id, base).run();
    if (r.meta.changes !== 1) {
      const row = await env.DB.prepare('SELECT last_iap, iap_cd FROM users WHERE id = ?').bind(u.id).first(), left = row.last_iap + (row.iap_cd || base) - t;
      return J({ error: 'You can claim free gold again in ' + remain(Math.max(60, left)) + '.', lastIap: row.last_iap, iapCd: row.iap_cd || 0, wait: left }, 429);
    }
    return J({ ok: true, lastIap: t, iapCd: cd, ...(await claimAll(env, u.id)) });
  },
};


// Discord: trade the login code for a token, then read who it is and which servers they are in
const discordOn = (env) => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
async function discordProfile(env, code, redirect) {
  const api = env.DISCORD_API || 'https://discord.com/api';
  const H = { 'user-agent': 'DiscordBot (https://github.com/Mndum/boomlings-web, 1)' };
  const tr = await fetch(api + '/oauth2/token', { method: 'POST', headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirect }) }).catch(() => null);
  const txt = tr ? await tr.text() : '', tok = (() => { try { return JSON.parse(txt); } catch (e) { return null; } })();
  if (!tok || !tok.access_token) return { error: tr ? 'Discord said ' + tr.status + ' ' + (tok ? (tok.error || '') + ' ' + (tok.error_description || '') : txt.replace(/<[^>]*>/g, ' ').slice(0, 80)).trim() : 'could not reach Discord' };
  const A = { ...H, authorization: 'Bearer ' + tok.access_token };
  const [me, gs] = await Promise.all([fetch(api + '/users/@me', { headers: A }).then((r) => r.json()).catch(() => null), fetch(api + '/users/@me/guilds', { headers: A }).then((r) => r.json()).catch(() => null)]);
  if (!me || !me.id) return null;
  return { id: String(me.id), name: String(me.global_name || me.username || ''), guilds: Array.isArray(gs) ? gs.map((g) => String(g.id)) : [] };
}
// a game name (3-12 letters/numbers/space/_/-) from a Discord name; attempt > 0 adds digits when the name is taken
function dcName(raw, attempt) {
  let n = String(raw || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 12).trim();
  if (n.length < 3) n = 'Player';
  if (attempt > 0) n = n.slice(0, 12 - 3) + String(100 + Math.floor(Math.random() * 900));
  return n;
}

const PUBLIC = new Set(['POST /api/register', 'POST /api/login', 'GET /api/iap', 'GET /api/ratings', 'POST /api/rate', 'GET /api/discord/callback', 'POST /api/discord/finish']);
const OPTIONAL_AUTH = new Set(['GET /api/leaderboard', 'POST /api/discord/start']);

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
