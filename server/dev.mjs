// Local stand-in for `wrangler dev`: serves the game's files and runs server/worker.js against an SQLite file (node:sqlite instead of D1).
// usage: node server/dev.mjs [port]   (data lives in server/dev.sqlite, delete it to start over)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker, { hashPw, b64 } from './worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = +process.argv[2] || 8787;
const sqlite = new DatabaseSync(path.join(root, 'server', 'dev.sqlite'));
sqlite.exec(fs.readFileSync(path.join(root, 'server', 'schema.sql'), 'utf8'));

// the small part of the D1 API the Worker uses
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  _s() { return sqlite.prepare(this.sql); }
  async first() { return this._s().get(...this.args) || null; }
  async all() { return { results: this._s().all(...this.args) }; }
  async run() { const r = this._s().run(...this.args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}
{ // local testing only: user "dev", password "dev-password"
  const salt = new Uint8Array(16); sqlite.prepare('DELETE FROM admin_creds').run();
  sqlite.prepare('INSERT INTO admin_creds (user_lc, pw_hash, pw_salt) VALUES (?, ?, ?)').run('dev', await hashPw('dev-password', salt), b64(salt));
}
const DB = { prepare: (sql) => new Stmt(sql), batch: (list) => Promise.all(list.map((s) => s.run())) };
const env = { DB, REF_REWARD_NEW: '100', REF_REWARD_OWNER: '100', REF_MAX_PER_OWNER: '50' };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.plist': 'text/xml', '.fnt': 'text/plain', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.css': 'text/css' };
const HIDDEN = /^\/(server|\.git|wrangler\.toml|\.assetsignore)(\/|$)/;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (HIDDEN.test(p) || !f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); res.writeHead(500); res.end('error'); }
}).listen(port, () => console.log('Boomlings dev server: http://localhost:' + port + '/'));
