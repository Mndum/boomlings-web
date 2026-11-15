// Cheat detector. Players can edit anything in their own browser, so the real checks live here on the server, where the numbers are compared
// with what the game could have produced. The game itself also reports tampering it can see (edited save file, coins that appeared out of
// nowhere, a sped-up clock). Everything ends up as a row in cheat_flags, which the admin site shows (Cheats page, with a badge for new ones).
import { J, bad, now, body } from './worker.js';

// severity: 1 = suspicious, 2 = likely, 3 = almost certain
export const CLIENT_KINDS = { save_edited: 3, gold_edit: 3, time_anomaly: 1 };
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// the same level maths as js/rules.js (points needed to finish a level)
const base4 = 20;
const levelTarget = (L) => (L === 1 ? 3000 : Math.floor((L * 8 + 10) * base4 * Math.max(1, 1 + (L - 1) * 0.1)));

// one row per player and kind while it is unreviewed: repeats only raise the counter
export async function flag(env, u, kind, severity, detail, source = 'server') {
  try {
    const t = now(), open = await env.DB.prepare('SELECT id FROM cheat_flags WHERE user_id = ? AND kind = ? AND resolved = 0 AND at > ?').bind(u.id, kind, t - 3600).first();
    if (open) await env.DB.prepare('UPDATE cheat_flags SET count = count + 1, at = ?, detail = ?, severity = MAX(severity, ?) WHERE id = ?').bind(t, clip(detail, 400), severity, open.id).run();
    else await env.DB.prepare('INSERT INTO cheat_flags (user_id, at, kind, severity, detail, source) VALUES (?, ?, ?, ?, ?, ?)').bind(u.id, t, kind, severity, clip(detail, 400), source).run();
  } catch (e) { /* the detector must never break the game */ }
}

// a score submitted for the leaderboard
export async function checkScore(env, u, { score, level, start, secs, moves }) {
  let bound = 20000; for (let i = 1; i <= level + 1; i++) bound += 10 * levelTarget(i);
  if (score > bound) await flag(env, u, 'score_implausible', 3, `Score ${score.toLocaleString('en-US')} at level ${level}: more than the game can give (limit about ${bound.toLocaleString('en-US')}).`);
  const played = level - Math.max(1, start || 1);
  if (secs > 0 && played >= 3 && secs < played * 4) await flag(env, u, 'too_fast', 2, `Reached level ${level} (started at ${Math.max(1, start || 1)}) in ${Math.round(secs)} s: about ${Math.round(secs / played)} s per level.`);
  if (moves >= 20 && secs > 0 && moves / secs > 4) await flag(env, u, 'inhuman_speed', 2, `${moves} moves in ${Math.round(secs)} s (${(moves / secs).toFixed(1)} moves per second).`);
}

// the cloud save: compared with the previous upload. Only things the game cannot do on its own are flagged.
export async function checkSave(env, u, text) {
  let d; try { d = JSON.parse(text); } catch (e) { return; }
  if (!d || typeof d !== 'object') return;
  const gold = Number(d.gold), st = d.stats && typeof d.stats === 'object' ? d.stats : {}, ks = Number(st.kSGold) || 0, games = Number(st.games) || 0, rank = Number(d.rank) || 1, best = Number(d.best) || 0;
  const t = now(), user = await env.DB.prepare('SELECT claimed_gold c FROM users WHERE id = ?').bind(u.id).first(), claimed = user ? user.c : 0;
  if (!Number.isFinite(gold) || gold < 0 || gold > 50000000 || rank < 1 || rank > 60) await flag(env, u, 'invalid_values', 3, `Impossible values in the save: gold ${d.gold}, rank ${d.rank}.`);
  const b = await env.DB.prepare('SELECT * FROM cheat_state WHERE user_id = ?').bind(u.id).first();
  if (b && Number.isFinite(gold)) {
    const dt = Math.max(0, t - b.t);
    // gold may rise by: coins earned in games (kSGold), what the server handed out (claimed), and the free offers (25 every 10 min, 50 a day)
    const allowed = Math.max(0, ks - b.ksgold) + Math.max(0, claimed - b.claimed) + 600 + 25 * Math.ceil(dt / 600) + 50 * (1 + Math.floor(dt / 86400));
    const excess = gold - b.gold - allowed;
    if (excess > 0) await flag(env, u, 'gold_jump', 3, `Gold went ${b.gold.toLocaleString('en-US')} -> ${Math.floor(gold).toLocaleString('en-US')} (+${Math.floor(gold - b.gold).toLocaleString('en-US')}) but only about ${Math.floor(allowed).toLocaleString('en-US')} could be explained (games ${Math.max(0, ks - b.ksgold)}, server gifts ${Math.max(0, claimed - b.claimed)}). Unexplained: ${Math.floor(excess).toLocaleString('en-US')}.`);
    if (rank - b.rank >= 3 && games - b.games <= 1) await flag(env, u, 'rank_jump', 3, `Rank ${b.rank} -> ${rank} after ${Math.max(0, games - b.games)} game(s).`);
    if (best > b.best && games <= b.games) await flag(env, u, 'best_edit', 2, `Best score ${b.best.toLocaleString('en-US')} -> ${best.toLocaleString('en-US')} without a finished game.`);
  }
  if (Number.isFinite(gold)) await env.DB.prepare('INSERT INTO cheat_state (user_id, t, gold, ksgold, games, rank, best, claimed) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET t = excluded.t, gold = excluded.gold, ksgold = excluded.ksgold, games = excluded.games, rank = excluded.rank, best = excluded.best, claimed = excluded.claimed').bind(u.id, t, Math.floor(gold), ks, games, rank, best, claimed).run();
}

// reports from the game itself: POST /api/cheat {kind, detail}
export async function clientReport(req, env, u, bodyFn) {
  const { kind, detail } = await bodyFn(req, 1500);
  if (!Object.prototype.hasOwnProperty.call(CLIENT_KINDS, kind)) return bad('Unknown report');
  await flag(env, u, kind, CLIENT_KINDS[kind], detail, 'game');
  return J({ ok: true });
}

// ---- admin side
export const cheatRoutes = {
  // ?count=1 -> only the number of unreviewed reports (the badge); ?all=1 includes reviewed ones
  async 'GET cheats'(req, env, url) {
    if (url.searchParams.get('count')) return J({ open: (await env.DB.prepare('SELECT COUNT(*) n FROM cheat_flags WHERE resolved = 0').first()).n });
    const all = url.searchParams.get('all');
    const rows = await env.DB.prepare(`SELECT f.id, f.user_id, u.name, u.banned, f.at, f.kind, f.severity, f.count, f.detail, f.source, f.resolved FROM cheat_flags f JOIN users u ON u.id = f.user_id ${all ? '' : 'WHERE f.resolved = 0'} ORDER BY f.resolved, f.severity DESC, f.at DESC LIMIT 200`).all();
    return J({ flags: rows.results, open: (await env.DB.prepare('SELECT COUNT(*) n FROM cheat_flags WHERE resolved = 0').first()).n });
  },
  // {id} marks one reviewed (or open again with resolved:0); {all:true} marks everything reviewed
  async 'POST cheatResolve'(req, env) {
    const b = await body(req, 500);
    const r = b.resolved === 0 ? 0 : 1;
    if (b.all) await env.DB.prepare('UPDATE cheat_flags SET resolved = ? WHERE resolved != ?').bind(r, r).run();
    else await env.DB.prepare('UPDATE cheat_flags SET resolved = ? WHERE id = ?').bind(r, +b.id).run();
    return J({ ok: true });
  },
};
