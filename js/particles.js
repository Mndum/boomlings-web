// cocos2d ParticleSystemQuad port: loads the game's particle plists (gravity and radius emitters) and renders them
// on the canvas. Sizes/speeds are in points, so everything is multiplied by 2 for the 640x960 canvas.
import { parsePlist, fetchText } from './plist.js';

const NAMES = ['starEffect', 'chargeEffect', 'glitterEffect', 'stoneHit', 'trailEffect', 'Skull_w_01', 'Skull_w_02', 'Skull_w_03', 'Ice_w_01', 'Ice_w_02', 'levelComplete01', 'levelComplete02', 'highscoreEffect01', 'highscoreEffect02', 'lvlupEffect'];
const rnd = () => Math.random() * 2 - 1;

export class Particles {
  constructor(defs, atlas) { this.defs = defs; this.atlas = atlas; this.list = []; this.tint = {}; }
  static async load(base, atlas) {
    const defs = {};
    await Promise.all(NAMES.map(async (n) => { try { defs[n] = parsePlist(await fetchText(base + n + '.plist')); } catch (e) { /* optional */ } }));
    return new Particles(defs, atlas);
  }
  // Starts an emitter at canvas position (x, y). Returns it; call .stop() on endless ones (duration -1).
  spawn(name, x, y, o = {}) {
    const d = this.defs[name]; if (!d) return null;
    const e = { d, x, y, t: 0, acc: 0, parts: [], stopped: false, scale: o.scale ?? 1, color: o.color || null, follow: o.follow || null, alive: o.alive || null, layer: o.layer || 'top', free: !!o.free, stop() { this.stopped = true; } };
    e.rate = d.maxParticles / Math.max(0.05, d.particleLifespan || 1);
    this.list.push(e);
    return e;
  }
  makeParticle(e) {
    const d = e.d, life = d.particleLifespan + d.particleLifespanVariance * rnd();
    if (life <= 0) return null;
    const p = { ox: e.free ? e.x : null, oy: e.free ? e.y : null, life, age: 0, x: (d.sourcePositionVariancex || 0) * rnd() * 2, y: (d.sourcePositionVariancey || 0) * rnd() * 2 };
    const ang = ((d.angle + d.angleVariance * rnd()) * Math.PI) / 180;
    if (d.emitterType === 1) {
      p.a = ang; p.r0 = d.maxRadius + d.maxRadiusVariance * rnd(); p.r1 = d.minRadius + d.minRadiusVariance * rnd();
      p.rot = (d.rotatePerSecond + d.rotatePerSecondVariance * rnd()) * Math.PI / 180;
    } else {
      const sp = d.speed + d.speedVariance * rnd();
      p.vx = Math.cos(ang) * sp; p.vy = -Math.sin(ang) * sp; // y flipped: cocos is y-up
    }
    p.s0 = Math.max(0, d.startParticleSize + d.startParticleSizeVariance * rnd());
    p.s1 = Math.max(0, d.finishParticleSize + (d.finishParticleSizeVariance || 0) * rnd());
    const c0 = [d.startColorRed + d.startColorVarianceRed * rnd(), d.startColorGreen + d.startColorVarianceGreen * rnd(), d.startColorBlue + d.startColorVarianceBlue * rnd(), d.startColorAlpha + d.startColorVarianceAlpha * rnd()];
    const c1 = [d.finishColorRed + d.finishColorVarianceRed * rnd(), d.finishColorGreen + d.finishColorVarianceGreen * rnd(), d.finishColorBlue + d.finishColorVarianceBlue * rnd(), d.finishColorAlpha + d.finishColorVarianceAlpha * rnd()];
    p.c0 = c0; p.c1 = c1;
    return p;
  }
  update(dt) {
    for (const e of this.list) {
      const d = e.d;
      e.t += dt;
      if (e.alive && !e.stopped && !e.alive()) e.stop();
      if (e.follow) { const f = e.follow(); if (f) { e.x = f[0]; e.y = f[1]; } }
      const active = !e.stopped && (d.duration < 0 || e.t < d.duration);
      if (active) {
        e.acc += dt * e.rate;
        // a short-duration burst emits its full count at once (cocos behaviour for tiny durations)
        let n = Math.floor(e.acc); e.acc -= n;
        if (d.duration >= 0 && d.duration <= 0.15 && e.t - dt <= 0) n = Math.max(n, d.maxParticles);
        while (n-- > 0 && e.parts.length < d.maxParticles * 2) { const p = this.makeParticle(e); if (p) e.parts.push(p); }
      }
      for (const p of e.parts) {
        p.age += dt;
        if (d.emitterType === 1) p.a += p.rot * dt;
        else { p.vx += (d.gravityx || 0) * dt; p.vy -= (d.gravityy || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      }
      e.parts = e.parts.filter((p) => p.age < p.life);
      e.dead = !active && !e.parts.length;
    }
    this.list = this.list.filter((e) => !e.dead);
  }
  draw(ctx, layer = 'top') {
    for (const e of this.list) {
      if (e.layer !== layer) continue;
      const d = e.d, img = this.atlas.frames[d.textureFileName] ? d.textureFileName : null;
      if (!img) continue;
      const additive = d.blendFuncDestination === 1;
      ctx.save(); ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (const p of e.parts) {
        const k = p.age / p.life;
        let px, py;
        if (d.emitterType === 1) { const r = p.r0 + (p.r1 - p.r0) * k; px = Math.cos(p.a) * r; py = -Math.sin(p.a) * r; } else { px = p.x; py = p.y; }
        const c = p.c0.map((v, i) => v + (p.c1[i] - v) * k), size = (p.s0 + (p.s1 - p.s0) * k) * e.scale * 2;
        if (size < 0.5) continue;
        const col = e.color || c;
        ctx.globalAlpha = Math.max(0, Math.min(1, c[3]));
        const name = img, s = this.atlas.frames[name], [w, h] = [s.sw, s.sh];
        // tint by drawing the white particle through a small offscreen colour multiply (cheap: use filter-free approach)
        const tinted = this.tinted(name, col);
        ctx.drawImage(tinted, (p.ox ?? e.x) + px * e.scale * 2 - size / 2, (p.oy ?? e.y) + py * e.scale * 2 - size / 2, size, size * (h / w));
      }
      ctx.restore();
    }
  }
  tinted(name, c) {
    const q = (v) => Math.max(0, Math.min(15, Math.round(v * 15)));
    const key = name + q(c[0]) + '_' + q(c[1]) + '_' + q(c[2]);
    if (this.tint[key]) return this.tint[key];
    const f = this.atlas.frames[name], cv = document.createElement('canvas'); cv.width = f.w; cv.height = f.h;
    const x = cv.getContext('2d');
    if (f.rot) { x.translate(f.w / 2, f.h / 2); x.rotate(-Math.PI / 2); x.drawImage(this.atlas.img, f.x, f.y, f.h, f.w, -f.h / 2, -f.w / 2, f.h, f.w); }
    else x.drawImage(this.atlas.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const base = document.createElement('canvas'); base.width = f.w; base.height = f.h; base.getContext('2d').drawImage(cv, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgb(${q(c[0]) * 17},${q(c[1]) * 17},${q(c[2]) * 17})`; x.fillRect(0, 0, f.w, f.h);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(base, 0, 0);
    return (this.tint[key] = cv);
  }
}
