import { parsePlist, parseNumbers, fetchText } from './plist.js';

const pad3 = (i) => String(i).padStart(3, '0');

// Resolves the game's objectDefinitions + *_AnimDesc.plist into drawable frame lists.
// A frame is either { single: 'Name.png' } or { parts: [{tex,x,y,sx,sy,rot,fx,fy,z}] } (HD pixels, y down).
export class AnimLibrary {
  constructor(defs, descs, atlas) {
    this.defs = defs; this.descs = descs; this.atlas = atlas; this.cache = {};
  }
  static async load(base, atlas) {
    const defs = parsePlist(await fetchText(base + 'objectDefinitions.plist'));
    const descNames = new Set();
    for (const d of Object.values(defs)) if (d.animDesc) descNames.add(d.animDesc);
    const descs = {};
    await Promise.all([...descNames].map(async (n) => { descs[n] = parsePlist(await fetchText(base + n)); }));
    return new AnimLibrary(defs, descs, atlas);
  }
  // Fully resolved definition for a type like "Bomb_r": follows "copy" and keeps the colour tag.
  resolveDef(type) {
    let def = this.defs[type];
    if (!def) return null;
    let tag = def.replaceTag || null, baseType = type;
    if (def.copy) {
      const src = this.defs[def.copy];
      baseType = def.copy;
      def = { ...src, ...def, animations: { ...(src.animations || {}), ...(def.animations || {}) } };
    }
    if (!tag) { const m = type.match(/_([a-z])$/); if (m) tag = m[1]; }
    return { def, tag, baseType };
  }
  // Returns { delay, looped, frames:[...] } or null.
  get(type, animName) {
    const key = type + '|' + animName;
    if (this.cache[key] !== undefined) return this.cache[key];
    const r = this.resolveDef(type);
    if (!r) return (this.cache[key] = null);
    const { def, tag, baseType } = r;
    let anim = def.animations && def.animations[animName];
    if (!anim) return (this.cache[key] = null);
    let frameBase = null;
    if (anim.copy) {
      const local = def.animations[anim.copy];
      const src = (local && !local.copy) ? local : this.defs.GlobalAnimations[anim.copy];
      if (src) {
        if (src.animFrameName) frameBase = src.animFrameName;
        else if (!local) frameBase = baseType + '_' + animName; // global without explicit name: Type_Anim
        anim = { ...src, ...anim }; delete anim.copy;
      }
    }
    const delay = parseFloat(anim.delay || '0.0833');
    const looped = anim.looped === '1';
    let indices;
    if (anim.frames) {
      const s = String(anim.frames).trim();
      indices = s.includes(' ') ? s.split(/\s+/).map(Number) : Array.from({ length: +s }, (_, i) => i + 1);
    } else indices = [1];
    const sub = (s) => s.replace(/xyz/g, tag || 'xyz');
    const desc = def.animDesc ? this.descs[def.animDesc] : null;
    const frames = [];
    for (const i of indices) {
      const partsKey = baseType + '_' + animName + '_' + pad3(i) + '.png';
      if (!frameBase && desc && desc.animationContainer && desc.animationContainer[partsKey]) {
        const parts = Object.values(desc.animationContainer[partsKey]).map((p) => {
          const [px, py] = parseNumbers(p.position); const [sx, sy] = parseNumbers(p.scale); const [fx, fy] = parseNumbers(p.flipped);
          return { tex: sub(p.texture), x: px * 2, y: -py * 2, sx, sy, rot: parseFloat(p.rotation) * Math.PI / 180, fx: !!fx, fy: !!fy, z: parseFloat(p.zValue) };
        }).sort((a, b) => a.z - b.z);
        frames.push({ parts });
        continue;
      }
      const candidates = [];
      if (frameBase) candidates.push(sub(frameBase) + '_' + pad3(i) + '.png');
      candidates.push(type + '_' + animName + '_' + pad3(i) + '.png', type + '_' + pad3(i) + '.png');
      if (type === 'Stone') candidates.push(animName === 'Idle02' ? 'Stone_01_b_001.png' : 'Stone_01_001.png');
      const name = candidates.find((c) => this.atlas.has(c));
      frames.push({ single: name || null });
    }
    return (this.cache[key] = { delay, looped, frames });
  }
  drawFrame(ctx, frame, x, y, o = {}) {
    if (!frame) return;
    const scale = o.scale ?? 1;
    if (frame.single) { this.atlas.draw(ctx, frame.single, x, y, o); return; }
    if (frame.parts) {
      ctx.save();
      if (o.alpha !== undefined && o.alpha !== 1) ctx.globalAlpha *= Math.max(0, Math.min(1, o.alpha));
      ctx.translate(x, y);
      if (o.rot) ctx.rotate(o.rot);
      ctx.scale(scale * (o.scaleX ?? 1), scale * (o.scaleY ?? 1));
      for (const p of frame.parts) this.atlas.draw(ctx, p.tex, p.x, p.y, { scaleX: p.sx, scaleY: p.sy, rot: p.rot, flipX: p.fx, flipY: p.fy });
      ctx.restore();
    }
  }
}

// Per-sprite animation state machine.
export class Animator {
  constructor(lib, type) {
    this.lib = lib; this.type = type; this.cur = null; this.idx = 0; this.acc = 0; this.onEnd = null; this.loop = false; this.name = null;
    this.play('Idle01', true);
  }
  play(name, loop = false, onEnd = null) {
    const a = this.lib.get(this.type, name);
    if (!a) { if (onEnd) onEnd(); return false; }
    this.cur = a; this.name = name; this.idx = 0; this.acc = 0; this.loop = loop; this.onEnd = onEnd; return true;
  }
  setType(type) { this.type = type; this.play(this.name || 'Idle01', this.loop, this.onEnd); }
  update(dt) {
    if (!this.cur) return;
    this.acc += dt;
    while (this.acc >= this.cur.delay) {
      this.acc -= this.cur.delay;
      this.idx++;
      if (this.idx >= this.cur.frames.length) {
        if (this.loop) this.idx = 0;
        else { this.idx = this.cur.frames.length - 1; const f = this.onEnd; this.onEnd = null; if (f) f(); return; }
      }
    }
  }
  frame() { return this.cur ? this.cur.frames[this.idx] : null; }
  draw(ctx, x, y, o) { this.lib.drawFrame(ctx, this.frame(), x, y, o); }
}
