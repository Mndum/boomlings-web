import { parsePlist, parseNumbers, fetchText, loadImage } from './plist.js';

// cocos2d-x sprite sheet (plist format 2). All sizes are in HD pixels.
export class Atlas {
  constructor(img, data) {
    this.img = img;
    this.frames = {};
    for (const [name, f] of Object.entries(data.frames)) {
      const [x, y, w, h] = parseNumbers(f.frame);
      const [ox, oy] = parseNumbers(f.offset || '{0,0}');
      const [sw, sh] = parseNumbers(f.sourceSize || `{${w},${h}}`);
      this.frames[name] = { x, y, w, h, rot: !!f.rotated, ox, oy, sw, sh };
    }
  }
  static async load(base) {
    const [img, text] = await Promise.all([loadImage(base + '.png'), fetchText(base + '.plist')]);
    return new Atlas(img, parsePlist(text));
  }
  has(name) { return !!this.frames[name]; }
  size(name) { const f = this.frames[name]; return f ? [f.sw, f.sh] : [0, 0]; }
  // Draw frame with its anchor point (ax, ay in 0..1 of sourceSize, y down) at (x, y).
  draw(ctx, name, x, y, o = {}) {
    const f = this.frames[name];
    if (!f) return;
    const scale = o.scale ?? 1, sx = (o.scaleX ?? 1) * scale, sy = (o.scaleY ?? 1) * scale;
    const ax = o.ax ?? 0.5, ay = o.ay ?? 0.5;
    ctx.save();
    if (o.alpha !== undefined && o.alpha !== 1) ctx.globalAlpha *= Math.max(0, Math.min(1, o.alpha));
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(sx * (o.flipX ? -1 : 1), sy * (o.flipY ? -1 : 1));
    // move so that the anchor lands on the origin; sprite content offset is y-up in cocos
    ctx.translate(-(ax - 0.5) * f.sw + f.ox, -(ay - 0.5) * f.sh - f.oy);
    if (f.rot) {
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(this.img, f.x, f.y, f.h, f.w, -f.h / 2, -f.w / 2, f.h, f.w);
    } else {
      ctx.drawImage(this.img, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
    }
    ctx.restore();
  }
  // Draw a frame stretched to a rectangle (for bars / backgrounds).
  drawRect(ctx, name, dx, dy, dw, dh, alpha = 1) {
    const f = this.frames[name];
    if (!f) return;
    ctx.save();
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    if (f.rot) {
      ctx.translate(dx + dw / 2, dy + dh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(this.img, f.x, f.y, f.h, f.w, -dh / 2, -dw / 2, dh, dw);
    } else {
      ctx.drawImage(this.img, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
    }
    ctx.restore();
  }
  // Draw only the left `fraction` of a frame (progress bars). Frame must not be rotated-sensitive: handled.
  drawClippedWidth(ctx, name, x, y, fraction, o = {}) {
    const f = this.frames[name];
    if (!f || fraction <= 0) return;
    const scale = o.scale ?? 1;
    const ax = o.ax ?? 0.5, ay = o.ay ?? 0.5;
    const left = x - ax * f.sw * scale, top = y - ay * f.sh * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, f.sw * scale * Math.min(1, fraction), f.sh * scale);
    ctx.clip();
    this.draw(ctx, name, x, y, o);
    ctx.restore();
  }
  // Unrotated copy of one frame as a canvas (cached); used for nine-slice scaling.
  bitmap(name) {
    this._bm = this._bm || {};
    if (this._bm[name]) return this._bm[name];
    const f = this.frames[name]; if (!f) return null;
    const c = document.createElement('canvas'); c.width = f.w; c.height = f.h; const x = c.getContext('2d');
    if (f.rot) { x.translate(f.w / 2, f.h / 2); x.rotate(-Math.PI / 2); x.drawImage(this.img, f.x, f.y, f.h, f.w, -f.h / 2, -f.w / 2, f.h, f.w); }
    else x.drawImage(this.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    return (this._bm[name] = c);
  }
  // Scale a frame to (w, h) keeping its border (b px in the source) undistorted. (x, y) is the top-left corner.
  nine(ctx, name, x, y, w, h, b = 30, alpha = 1) { const bm = this.bitmap(name); if (bm) nineSlice(ctx, bm, x, y, w, h, b, alpha); }
}

// Nine-slice for any drawable (canvas or image). b can be a number or [l, t, r, bt].
export function nineSlice(ctx, img, x, y, w, h, b = 30, alpha = 1) {
  const [l, t, r, bt] = Array.isArray(b) ? b : [b, b, b, b];
  const sw = img.width, sh = img.height;
  const lw = Math.min(l, w / 2), rw = Math.min(r, w / 2), th = Math.min(t, h / 2), bh = Math.min(bt, h / 2);
  ctx.save(); if (alpha !== 1) ctx.globalAlpha *= alpha;
  const D = (sx, sy, sw2, sh2, dx, dy, dw, dh) => { if (sw2 > 0 && sh2 > 0 && dw > 0 && dh > 0) ctx.drawImage(img, sx, sy, sw2, sh2, dx, dy, dw, dh); };
  D(0, 0, l, t, x, y, lw, th); D(l, 0, sw - l - r, t, x + lw, y, w - lw - rw, th); D(sw - r, 0, r, t, x + w - rw, y, rw, th);
  D(0, t, l, sh - t - bt, x, y + th, lw, h - th - bh); D(l, t, sw - l - r, sh - t - bt, x + lw, y + th, w - lw - rw, h - th - bh); D(sw - r, t, r, sh - t - bt, x + w - rw, y + th, rw, h - th - bh);
  D(0, sh - bt, l, bt, x, y + h - bh, lw, bh); D(l, sh - bt, sw - l - r, bt, x + lw, y + h - bh, w - lw - rw, bh); D(sw - r, sh - bt, r, bt, x + w - rw, y + h - bh, rw, bh);
  ctx.restore();
}
