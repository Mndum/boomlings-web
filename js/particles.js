// cocos2d-x 2.x CCParticleSystemQuad, ported from the game's own decompiled engine (CCParticleSystem::initParticle / ::update): loads the game's
// particle plists (gravity and radius emitters) and renders them on the canvas. Sizes/speeds are in points, so everything is multiplied by 2 for
// the 640x960 canvas. The system is stepped at the game's own 60 fps (fixed 1/60 s steps), because the emission rules depend on the frame step.
import { parsePlist, fetchText } from './plist.js';

const NAMES = ['starEffect', 'chargeEffect', 'glitterEffect', 'stoneHit', 'trailEffect', 'Skull_w_01', 'Skull_w_02', 'Skull_w_03', 'Ice_w_01', 'Ice_w_02', 'levelComplete01', 'levelComplete02', 'highscoreEffect01', 'highscoreEffect02', 'lvlupEffect'];
const rnd = () => Math.random() * 2 - 1;   // CCRANDOM_MINUS1_1
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const DEG = Math.PI / 180, STEP = 1 / 60;

export class Particles {
  constructor(defs, atlas) { this.defs = defs; this.atlas = atlas; this.list = []; this.tint = {}; this.acc = 0; }
  static async load(base, atlas) {
    const defs = {};
    await Promise.all(NAMES.map(async (n) => { try { defs[n] = parsePlist(await fetchText(base + n + '.plist')); } catch (e) { /* optional */ } }));
    return new Particles(defs, atlas);
  }
  // Starts an emitter at canvas position (x, y). Returns it; call .stop() on endless ones (duration -1).
  spawn(name, x, y, o = {}) {
    const d = this.defs[name]; if (!d) return null;
    const e = { d, x, y, elapsed: 0, counter: 0, parts: [], stopped: false, scale: o.scale ?? 1, color: o.color || null, follow: o.follow || null, alive: o.alive || null, layer: o.layer || 'top', free: !!o.free, stop() { this.stopped = true; } };
    // emissionRate = totalParticles / lifespan; a lifespan of 0 gives an infinite rate: the system refills to its maximum every frame
    e.rate = d.particleLifespan > 0 ? d.maxParticles / d.particleLifespan : Infinity;
    this.list.push(e);
    return e;
  }
  // CCParticleSystem::initParticle. State is kept y-up like cocos; the y flip happens when drawing.
  makeParticle(e) {
    const d = e.d, life = Math.max(0, d.particleLifespan + d.particleLifespanVariance * rnd());
    const p = { ox: e.free ? e.x : null, oy: e.free ? e.y : null, life };
    p.x = (d.sourcePositionVariancex || 0) * rnd();   // the plist's sourcePosition becomes the node position (the game sets it itself), so only the variance remains
    p.y = (d.sourcePositionVariancey || 0) * rnd();
    p.c = [clamp01(d.startColorRed + d.startColorVarianceRed * rnd()), clamp01(d.startColorGreen + d.startColorVarianceGreen * rnd()), clamp01(d.startColorBlue + d.startColorVarianceBlue * rnd()), clamp01(d.startColorAlpha + d.startColorVarianceAlpha * rnd())];
    const c1 = [clamp01(d.finishColorRed + d.finishColorVarianceRed * rnd()), clamp01(d.finishColorGreen + d.finishColorVarianceGreen * rnd()), clamp01(d.finishColorBlue + d.finishColorVarianceBlue * rnd()), clamp01(d.finishColorAlpha + d.finishColorVarianceAlpha * rnd())];
    p.dc = life > 0 ? c1.map((v, i) => (v - p.c[i]) / life) : [0, 0, 0, 0];
    p.size = Math.max(0, d.startParticleSize + d.startParticleSizeVariance * rnd());
    p.dsize = d.finishParticleSize === -1 || life <= 0 ? 0 : (Math.max(0, d.finishParticleSize + (d.finishParticleSizeVariance || 0) * rnd()) - p.size) / life;
    p.rot = d.rotationStart + d.rotationStartVariance * rnd();
    p.drot = life > 0 ? (d.rotationEnd + d.rotationEndVariance * rnd() - p.rot) / life : 0;
    const a = (d.angle + d.angleVariance * rnd()) * DEG;
    if (d.emitterType === 1) {
      p.a = a; p.radius = d.maxRadius + d.maxRadiusVariance * rnd();
      p.dradius = d.minRadius === -1 || life <= 0 ? 0 : (d.minRadius + d.minRadiusVariance * rnd() - p.radius) / life;
      p.spin = (d.rotatePerSecond + d.rotatePerSecondVariance * rnd()) * DEG;
      p.x = 0; p.y = 0;
    } else {
      const sp = d.speed + d.speedVariance * rnd();
      p.dx = Math.cos(a) * sp; p.dy = Math.sin(a) * sp;
      p.rad = d.radialAcceleration + d.radialAccelVariance * rnd(); p.tan = d.tangentialAcceleration + d.tangentialAccelVariance * rnd();
    }
    return p;
  }
  // CCParticleSystem::update for one 1/60 s step
  step(dt) {
    for (const e of this.list) {
      const d = e.d, max = d.maxParticles;
      if (e.alive && !e.stopped && !e.alive()) e.stop();
      if (e.follow) { const f = e.follow(); if (f) { e.x = f[0]; e.y = f[1]; } }
      if (!e.stopped) {
        const every = e.rate === Infinity ? 0 : 1 / e.rate;
        if (e.parts.length < max) e.counter += dt;   // no build-up while full (cocos issue #1201)
        while (e.parts.length < max && e.counter > every) { e.parts.push(this.makeParticle(e)); e.counter -= every; }
        e.elapsed += dt;
        if (d.duration !== -1 && d.duration < e.elapsed) e.stopped = true;   // stopSystem
      }
      const keep = [];
      for (const p of e.parts) {
        p.life -= dt;
        if (p.life <= 0) continue;   // dead on arrival (lifespan clamped to 0) or out of time
        if (d.emitterType === 1) {
          p.a += p.spin * dt; p.radius += p.dradius * dt;
          p.x = -Math.cos(p.a) * p.radius; p.y = -Math.sin(p.a) * p.radius;
        } else {
          let rx = 0, ry = 0;
          if (p.x || p.y) { const l = Math.hypot(p.x, p.y); rx = p.x / l; ry = p.y / l; }
          const tx = -ry * p.tan, ty = rx * p.tan;   // tangential: the radial vector turned a quarter
          p.dx += (rx * p.rad + tx + (d.gravityx || 0)) * dt; p.dy += (ry * p.rad + ty + (d.gravityy || 0)) * dt;
          p.x += p.dx * dt; p.y += p.dy * dt;
        }
        for (let i = 0; i < 4; i++) p.c[i] += p.dc[i] * dt;
        p.size = Math.max(0, p.size + p.dsize * dt);
        p.rot += p.drot * dt;
        keep.push(p);
      }
      e.parts = keep;
      e.dead = e.stopped && !e.parts.length;
    }
    this.list = this.list.filter((e) => !e.dead);
  }
  update(dt) {
    this.acc += Math.min(dt, 0.25);
    for (let n = 0; this.acc >= STEP && n < 15; n++) { this.step(STEP); this.acc -= STEP; }
    if (this.acc >= STEP) this.acc = 0;
  }
  draw(ctx, layer = 'top') {
    for (const e of this.list) {
      if (e.layer !== layer) continue;
      const d = e.d, img = this.atlas.frames[d.textureFileName] ? d.textureFileName : null;
      if (!img) continue;
      const additive = d.blendFuncDestination === 1;
      ctx.save(); ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (const p of e.parts) {
        const size = p.size * e.scale * 2;   // the quad is a square of `size` points
        if (size < 0.5) continue;
        const col = e.color || p.c, cx = (p.ox ?? e.x) + p.x * e.scale * 2, cy = (p.oy ?? e.y) - p.y * e.scale * 2;
        ctx.globalAlpha = clamp01(p.c[3]);
        ctx.save(); ctx.translate(cx, cy); if (p.rot) ctx.rotate(p.rot * DEG);
        ctx.drawImage(this.tinted(img, col), -size / 2, -size / 2, size, size);
        ctx.restore();
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
