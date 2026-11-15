// Durable Object "Hub": one live room. Players (signed in) and the admin site connect by WebSocket; this relays
//   player -> admin : state changes, join/leave, and screen frames (only while an admin is watching that player)
//   admin -> player : "stream on/off" and pranks, delivered instantly
// Sockets hibernate between messages, so an idle room costs nothing. Roles are decided by the Worker (it checks the tokens).
import { DurableObject } from 'cloudflare:workers';

const PRANKS = new Set(['message', 'toast', 'sound', 'fakegold', 'flip', 'mirror', 'tiny', 'wobble', 'rainbow', 'invert', 'gray', 'sepia', 'blur', 'zoomies', 'shake', 'bounce', 'squish', 'ghost', 'flicker', 'drunk', 'nightmare', 'emojirain', 'speak', 'vibrate', 'chipmunk', 'slowmo', 'fakecrash', 'fakeupdate', 'fakeban']);
const send = (ws, o) => { try { ws.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch (e) { /* socket already closed */ } };

export class Hub extends DurableObject {
  players(id) { return this.ctx.getWebSockets(id ? 'p' + id : 'player'); }
  att(ws) { return ws.deserializeAttachment() || {}; }

  async fetch(req) {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const role = req.headers.get('x-role'), proto = req.headers.get('sec-websocket-protocol');
    const [client, server] = Object.values(new WebSocketPair());
    if (role === 'admin') {
      this.ctx.acceptWebSocket(server, ['admin']);
      server.serializeAttachment({ role: 'admin', watch: 0 });
      send(server, { t: 'list', players: this.players().map((w) => this.att(w)).map((a) => ({ id: a.id, name: a.name, state: a.state || {} })) });
    } else {
      const id = +req.headers.get('x-uid'), name = req.headers.get('x-name');
      for (const old of this.players(id)) { try { old.close(1000, 'replaced'); } catch (e) { /* ignore */ } }   // one connection per player
      this.ctx.acceptWebSocket(server, ['player', 'p' + id]);
      server.serializeAttachment({ role: 'player', id, name, state: {} });
      this.toAdmins({ t: 'join', id, name, state: {} });
    }
    return new Response(null, { status: 101, webSocket: client, headers: proto ? { 'sec-websocket-protocol': proto } : {} });
  }

  toAdmins(o, watchingId) {
    const s = JSON.stringify(o);
    for (const a of this.ctx.getWebSockets('admin')) { if (!watchingId || this.att(a).watch === watchingId) send(a, s); }
  }
  syncStream(id, except) {   // tell a player whether anybody is watching (so frames are only produced when needed)
    const on = this.ctx.getWebSockets('admin').some((a) => a !== except && this.att(a).watch === id);
    for (const p of this.players(id)) { const a = this.att(p); if (!!a.stream !== on) { a.stream = on; p.serializeAttachment(a); send(p, { t: 'stream', on }); } }
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 60000) return;
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    const a = this.att(ws);
    if (a.role === 'player') {
      if (m.t === 'state' && m.state && typeof m.state === 'object') {
        a.state = { screen: String(m.state.screen || '').slice(0, 30), score: +m.state.score || 0, level: +m.state.level || 0, gold: +m.state.gold || 0, rank: +m.state.rank || 0, icon: /^kIcon_\d{3}$/.test(m.state.icon) ? m.state.icon : '', effects: Array.isArray(m.state.effects) ? m.state.effects.slice(0, 10).map(String) : [] };
        ws.serializeAttachment(a);
        this.toAdmins({ t: 'state', id: a.id, name: a.name, state: a.state });
      } else if (m.t === 'frame' && typeof m.d === 'string' && m.d.startsWith('data:image/jpeg;base64,')) {
        this.toAdmins({ t: 'frame', id: a.id, d: m.d }, a.id);
      }
    } else if (a.role === 'admin') {
      if (m.t === 'watch') {
        const prev = a.watch; a.watch = +m.id || 0; ws.serializeAttachment(a);
        if (prev) this.syncStream(prev);
        if (a.watch) this.syncStream(a.watch);
      } else if (m.t === 'prank' && PRANKS.has(m.type)) {
        const p = { t: 'prank', type: m.type, secs: Math.max(2, Math.min(30, Math.floor(+m.secs) || 10)), text: String(m.text || '').slice(0, 40), text2: String(m.text2 || '').slice(0, 140) };
        const targets = m.id === 'all' ? this.players() : this.players(+m.id);
        targets.forEach((w) => send(w, p));
        send(ws, { t: 'sent', n: targets.length, type: m.type });
        if (targets.length) {
          const one = targets.length === 1 ? this.att(targets[0]) : null;
          try { await this.env.DB.prepare('INSERT INTO admin_log (at, action, target_id, target_name, detail) VALUES (?, ?, ?, ?, ?)').bind(Math.floor(Date.now() / 1000), 'prank', one ? one.id : null, one ? one.name : null, m.type + (one ? '' : ' on ' + targets.length + ' players')).run(); } catch (e) { /* log is best effort */ }
        }
      }
    }
  }

  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    const a = this.att(ws);
    if (a.role === 'player') { if (!this.players(a.id).some((w) => w !== ws)) this.toAdmins({ t: 'leave', id: a.id }); }
    else if (a.role === 'admin' && a.watch) this.syncStream(a.watch, ws);
    try { ws.close(); } catch (e) { /* already closed */ }
  }
}
