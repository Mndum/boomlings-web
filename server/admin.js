// Admin API for the /admin/ site. Every call needs the ADMIN_KEY secret in the X-Admin-Key header.
import { J, bad, eq, hashPw, b64, NAME_RE, now, body, sha256, hex } from './worker.js';
import { cheatRoutes } from './cheat.js';

export const adminOk = async (req, env) => {
  const t = req.headers.get('x-admin-token') || '';
  return t.length === 64 && !!(await env.DB.prepare('SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').bind(await sha256(t), now()).first());
};
const MAX_FAILS = 5, LOCK_SECONDS = 900, SESSION_SECONDS = 12 * 3600;
async function login(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  if ((await env.DB.prepare('SELECT COUNT(*) n FROM admin_attempts WHERE ip = ? AND at > ?').bind(ip, now() - LOCK_SECONDS).first()).n >= MAX_FAILS) return bad('Too many wrong attempts. Try again in 15 minutes.', 429);
  const { user, pass } = await body(req, 1000);
  const row = typeof user === 'string' ? await env.DB.prepare('SELECT * FROM admin_creds WHERE user_lc = ?').bind(user.trim().toLowerCase()).first() : null;
  const h = await hashPw(String(pass || ''), row ? Uint8Array.from(atob(row.pw_salt), (c) => c.charCodeAt(0)) : new Uint8Array(16));   // same work either way
  if (!row || !eq(h, row.pw_hash)) {
    await env.DB.batch([env.DB.prepare('INSERT INTO admin_attempts (ip, at) VALUES (?, ?)').bind(ip, now()), env.DB.prepare('DELETE FROM admin_attempts WHERE at < ?').bind(now() - 86400)]);
    return bad('Wrong username or password', 401);
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').bind(await sha256(token), now() + SESSION_SECONDS), env.DB.prepare('DELETE FROM admin_attempts WHERE ip = ?').bind(ip), env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now())]);
  return J({ token, expiresIn: SESSION_SECONDS });
}
const logAct = (env, action, u, detail) => env.DB.prepare('INSERT INTO admin_log (at, action, target_id, target_name, detail) VALUES (?, ?, ?, ?, ?)').bind(now(), action, u ? u.id : null, u ? u.name : null, detail || null).run();
// keep the cloud copy in step when an admin changes someone's coins
async function editSaveGold(env, id, fn) {
  const s = await env.DB.prepare('SELECT data FROM saves WHERE user_id = ?').bind(id).first();
  if (!s) return;
  try { const d = JSON.parse(s.data); d.gold = Math.max(0, fn(Number(d.gold) || 0)); await env.DB.prepare('UPDATE saves SET data = ? WHERE user_id = ?').bind(JSON.stringify(d), id).run(); } catch (e) { /* unreadable save: leave it */ }
}
// tell the player's open game to claim right now, so coins an admin gives or takes show up live (a player who is offline gets them on next open)
async function pokeClaim(env, id) {
  try { await env.HUB.get(env.HUB.idFromName('main')).fetch('https://hub/claim', { method: 'POST', headers: { 'x-internal': 'claim', 'x-uid': String(id) } }); } catch (e) { /* not online: it will claim on next open */ }
}
const PRANKS = new Set(['message', 'toast', 'sound', 'fakegold', 'flip', 'mirror', 'tiny', 'wobble', 'rainbow', 'invert', 'gray', 'sepia', 'blur', 'zoomies', 'shake', 'bounce', 'squish', 'ghost', 'flicker', 'drunk', 'nightmare', 'emojirain', 'speak', 'vibrate', 'chipmunk', 'slowmo', 'bombrain', 'iconrain', 'spin', 'pulse', 'tilt', 'silence', 'blackout', 'jumpscare', 'fakeads', 'fakeoffline', 'fakebattery', 'bandit', 'fakecrashpc', 'fakecrashandroid', 'fakecrashios', 'fakeupdate', 'fakeban']);
const cleanQ = (s) => String(s || '').toLowerCase().replace(/[%_\\]/g, ' ').trim().slice(0, 30);

const admin = {
  async 'GET stats'(req, env) {
    const one = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).first()) || {};
    const day = now() - 86400;
    const [users, banned, today, scores, saves, sessions, refs, gold, perDay, recent, log] = await Promise.all([
      one('SELECT COUNT(*) n FROM users'), one('SELECT COUNT(*) n FROM users WHERE banned = 1'), one('SELECT COUNT(*) n FROM users WHERE created_at > ?', day),
      one('SELECT COUNT(*) n FROM scores WHERE best_score > 0'), one('SELECT COUNT(*) n FROM saves'), one('SELECT COUNT(*) n FROM sessions WHERE expires_at > ?', now()),
      one('SELECT COUNT(*) n FROM users WHERE referred_by IS NOT NULL'), one('SELECT COALESCE(SUM(earned_gold),0) n FROM users'),
      env.DB.prepare("SELECT date(created_at, 'unixepoch') d, COUNT(*) n FROM users WHERE created_at > ? GROUP BY d ORDER BY d").bind(now() - 14 * 86400).all(),
      env.DB.prepare('SELECT id, name, created_at, banned FROM users ORDER BY id DESC LIMIT 6').all(),
      env.DB.prepare('SELECT at, action, target_name, detail FROM admin_log ORDER BY id DESC LIMIT 6').all(),
    ]);
    return J({ users: users.n, banned: banned.n, today: today.n, scores: scores.n, saves: saves.n, sessions: sessions.n, referred: refs.n, referralGold: gold.n, perDay: perDay.results, recent: recent.results, log: log.results });
  },

  async 'GET users'(req, env, url) {
    const q = cleanQ(url.searchParams.get('q')), f = url.searchParams.get('filter') === 'banned' ? 1 : 0, off = Math.max(0, +url.searchParams.get('offset') || 0);
    const rows = await env.DB.prepare(`SELECT u.id, u.name, u.created_at, u.banned, u.ban_reason, u.ref_code, u.earned_gold,
        (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) AS referrals, s.best_score, s.best_level, s.rank, sv.updated_at AS saved_at, COALESCE(json_extract(sv.data, '$.icon'), s.icon) AS icon
      FROM users u LEFT JOIN scores s ON s.user_id = u.id LEFT JOIN saves sv ON sv.user_id = u.id
      WHERE (?1 = '' OR u.name_lc LIKE '%' || ?1 || '%' OR u.ref_code = upper(?1) OR CAST(u.id AS TEXT) = ?1) AND (?2 = 0 OR u.banned = 1)
      ORDER BY u.id DESC LIMIT 51 OFFSET ?3`).bind(q, f, off).all();
    return J({ users: rows.results.slice(0, 50), more: rows.results.length > 50 });
  },

  async 'GET user'(req, env, url) {
    const id = +url.searchParams.get('id');
    const u = await env.DB.prepare('SELECT id, name, created_at, banned, ban_reason, ref_code, referred_by, earned_gold, claimed_gold, take_gold, wipe_gold, last_iap FROM users WHERE id = ?').bind(id).first();
    if (!u) return bad('No such player', 404);
    const [sc, sv, ses, by, refs] = await Promise.all([
      env.DB.prepare('SELECT best_score, best_level, rank, icon, updated_at FROM scores WHERE user_id = ?').bind(id).first(),
      env.DB.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').bind(id).first(),
      env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > ?').bind(id, now()).first(),
      u.referred_by ? env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(u.referred_by).first() : null,
      env.DB.prepare('SELECT id, name FROM users WHERE referred_by = ? ORDER BY id DESC LIMIT 20').bind(id).all(),
    ]);
    let save = null;
    if (sv) { try { const d = JSON.parse(sv.data); save = { updatedAt: sv.updated_at, icon: d.icon, gold: d.gold, xp: d.xp, rank: d.rank, name: d.name, icons: (d.icons || []).length, games: d.stats && d.stats.games, best: d.best }; } catch (e) { save = { updatedAt: sv.updated_at, broken: true }; } }
    return J({ user: u, score: sc, save, sessions: ses.n, referredBy: by, referrals: refs.results });
  },

  async 'GET scores'(req, env) {
    const rows = await env.DB.prepare('SELECT s.user_id AS id, u.name, u.banned, s.best_score AS score, s.best_level AS level, s.rank, s.icon FROM scores s JOIN users u ON u.id = s.user_id WHERE s.best_score > 0 ORDER BY s.best_level DESC, s.best_score DESC LIMIT 200').all();
    return J({ entries: rows.results });
  },

  async 'GET log'(req, env) {
    return J({ log: (await env.DB.prepare('SELECT at, action, target_id, target_name, detail FROM admin_log ORDER BY id DESC LIMIT 200').all()).results });
  },

  async 'GET ratings'(req, env) {
    const [agg, rows] = await Promise.all([env.DB.prepare('SELECT COUNT(*) n, AVG(stars) avg FROM ratings').first(), env.DB.prepare('SELECT id, stars, name, comment, at FROM ratings ORDER BY at DESC LIMIT 200').all()]);
    return J({ count: agg.n, average: agg.n ? Math.round(agg.avg * 10) / 10 : 0, ratings: rows.results });
  },
  async 'POST deleteRating'(req, env) {
    const b = await body(req, 200);
    await env.DB.prepare('DELETE FROM ratings WHERE id = ?').bind(+b.id).run();
    await logAct(env, 'delete review', null, '#' + (+b.id));
    return J({ ok: true });
  },

  // who is playing right now (heartbeat within the last 20s), with their screen, score and snapshot
  async 'GET live'(req, env, url) {
    const only = +url.searchParams.get('id') || 0;
    const rows = await env.DB.prepare(`SELECT l.user_id AS id, u.name, l.seen, l.state, l.thumb FROM live l JOIN users u ON u.id = l.user_id WHERE l.seen > ? ${only ? 'AND l.user_id = ?' : ''} ORDER BY l.seen DESC LIMIT 50`).bind(...(only ? [now() - 20, only] : [now() - 20])).all();
    return J({ now: now(), players: rows.results.map((r) => ({ id: r.id, name: r.name, seen: r.seen, state: r.state ? JSON.parse(r.state) : {}, thumb: r.thumb })) });
  },

  // queue a prank for one player or everybody who is online: {id | 'all', type, secs, text, text2}
  async 'POST prank'(req, env) {
    const b = await body(req, 2000), t = now();
    if (!PRANKS.has(b.type)) return bad('Unknown prank');
    const data = JSON.stringify({ type: b.type, secs: Math.max(2, Math.min(30, Math.floor(+b.secs) || 10)), text: String(b.text || '').slice(0, 40), text2: String(b.text2 || '').slice(0, 140) });
    let targets;
    if (b.id === 'all') targets = (await env.DB.prepare('SELECT user_id FROM live WHERE seen > ?').bind(t - 20).all()).results.map((r) => r.user_id);
    else { const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(+b.id).first(); if (!u) return bad('No such player', 404); targets = [u.id]; }
    if (!targets.length) return bad('Nobody is online right now', 409);
    await env.DB.batch(targets.map((id) => env.DB.prepare('INSERT INTO pranks (user_id, at, data) VALUES (?, ?, ?)').bind(id, t, data)));
    await logAct(env, 'prank', targets.length === 1 ? await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(targets[0]).first() : null, b.type + (targets.length > 1 ? ' on ' + targets.length + ' players' : ''));
    return J({ ok: true, sent: targets.length });
  },

  // one endpoint for every change: {action, id, ...}
  async 'POST action'(req, env) {
    const b = await body(req, 2000), id = +b.id;
    const u = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(id).first();
    if (!u) return bad('No such player', 404);
    switch (b.action) {
      case 'ban': {
        const why = String(b.reason || '').slice(0, 200);
        await env.DB.batch([env.DB.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').bind(why || null, id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)]);
        await logAct(env, 'ban', u, why); break;
      }
      case 'unban': await env.DB.prepare('UPDATE users SET banned = 0, ban_reason = NULL WHERE id = ?').bind(id).run(); await logAct(env, 'unban', u); break;
      case 'kick': await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run(); await logAct(env, 'sign out everywhere', u); break;
      case 'grant': {
        const g = Math.floor(+b.gold);
        if (!(g >= 1 && g <= 1000000)) return bad('Gold must be 1 to 1,000,000');
        await env.DB.prepare('UPDATE users SET earned_gold = earned_gold + ? WHERE id = ?').bind(g, id).run();
        await pokeClaim(env, id);
        await logAct(env, 'gift gold', u, g + ' gold (live if they are online, otherwise when they next open the game)'); break;
      }
      case 'takeGold': {
        const g = Math.floor(+b.gold);
        if (!(g >= 1 && g <= 1000000000)) return bad('Enter how many coins to take');
        await env.DB.prepare('UPDATE users SET take_gold = take_gold + ? WHERE id = ?').bind(g, id).run();
        await editSaveGold(env, id, (c) => c - g);
        await pokeClaim(env, id);
        await logAct(env, 'take coins', u, g + ' coins (live if they are online, otherwise when they next open the game)'); break;
      }
      case 'wipeGold':
        await env.DB.prepare('UPDATE users SET wipe_gold = 1, take_gold = 0 WHERE id = ?').bind(id).run();
        await editSaveGold(env, id, () => 0);
        await pokeClaim(env, id);
        await logAct(env, 'set coins to 0', u, 'live if they are online, otherwise when they next open the game'); break;
      case 'resetIap': await env.DB.prepare('UPDATE users SET last_iap = 0, iap_cd = 0 WHERE id = ?').bind(id).run(); await logAct(env, 'reset free-gold timer', u); break;
      case 'rename': {
        const nm = String(b.name || '').trim();
        if (!NAME_RE.test(nm)) return bad('Name must be 3-12 letters, numbers, space, _ or -');
        if (await env.DB.prepare('SELECT 1 FROM users WHERE name_lc = ? AND id != ?').bind(nm.toLowerCase(), id).first()) return bad('That name is taken', 409);
        await env.DB.prepare('UPDATE users SET name = ?, name_lc = ? WHERE id = ?').bind(nm, nm.toLowerCase(), id).run();
        await logAct(env, 'rename', u, u.name + ' -> ' + nm); break;
      }
      case 'resetpw': {
        const pw = String(b.password || '');
        if (pw.length < 6 || pw.length > 100) return bad('Password must be 6-100 characters');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        await env.DB.batch([env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(await hashPw(pw, salt), b64(salt), id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)]);
        await logAct(env, 'reset password', u); break;
      }
      case 'clearScore': await env.DB.prepare('DELETE FROM scores WHERE user_id = ?').bind(id).run(); await logAct(env, 'remove from leaderboard', u); break;
      case 'clearSave': await env.DB.prepare('DELETE FROM saves WHERE user_id = ?').bind(id).run(); await logAct(env, 'delete cloud save', u); break;
      case 'delete':
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET referred_by = NULL WHERE referred_by = ?').bind(id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id), env.DB.prepare('DELETE FROM live WHERE user_id = ?').bind(id), env.DB.prepare('DELETE FROM pranks WHERE user_id = ?').bind(id),
          env.DB.prepare('DELETE FROM saves WHERE user_id = ?').bind(id), env.DB.prepare('DELETE FROM scores WHERE user_id = ?').bind(id), env.DB.prepare('DELETE FROM cheat_flags WHERE user_id = ?').bind(id), env.DB.prepare('DELETE FROM cheat_state WHERE user_id = ?').bind(id), env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id)]);
        await logAct(env, 'delete account', u); break;
      default: return bad('Unknown action');
    }
    return J({ ok: true });
  },
};

Object.assign(admin, cheatRoutes);

export async function adminHandler(req, env, url) {
  const path = url.pathname.slice('/api/admin/'.length);
  try {
    if (req.method === 'POST' && path === 'login') return await login(req, env);
    if (!(await adminOk(req, env))) return bad('Please sign in', 401);
    if (req.method === 'POST' && path === 'logout') { await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(req.headers.get('x-admin-token'))).run(); return J({ ok: true }); }
  } catch (e) { if (e instanceof SyntaxError) return bad('Bad JSON'); console.error(e); return bad('Server error', 500); }
  const fn = admin[req.method + ' ' + path];
  if (!fn) return bad('Not found', 404);
  try { return await fn(req, env, url); }
  catch (e) { if (e instanceof SyntaxError) return bad('Bad JSON'); console.error(e); return bad('Server error', 500); }
}
