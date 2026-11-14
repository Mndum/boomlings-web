import { fetchText, loadImage } from './plist.js';

// AngelCode BMFont (text format) renderer for canvas.
export class BMFont {
  constructor(text, img) {
    this.img = img;
    this.chars = {};
    this.kern = {};
    this.lineHeight = 32; this.base = 28;
    for (const line of text.split(/\r?\n/)) {
      const kv = {};
      const parts = line.trim().split(/\s+/);
      const tag = parts.shift();
      for (const p of parts) { const m = p.match(/^([^=]+)=(.*)$/); if (m) kv[m[1]] = m[2].replace(/^"|"$/g, ''); }
      if (tag === 'common') { this.lineHeight = +kv.lineHeight; this.base = +kv.base; }
      else if (tag === 'char') this.chars[+kv.id] = { x: +kv.x, y: +kv.y, w: +kv.width, h: +kv.height, xo: +kv.xoffset, yo: +kv.yoffset, xa: +kv.xadvance };
      else if (tag === 'kerning') this.kern[kv.first + ',' + kv.second] = +kv.amount;
    }
  }
  static async load(base) {
    const text = await fetchText(base + '.fnt');
    const file = (text.match(/file="([^"]+)"/) || [])[1] || (base.split('/').pop() + '.png');
    const dir = base.slice(0, base.lastIndexOf('/') + 1);
    const img = await loadImage(dir + file);
    return new BMFont(text, img);
  }
  // Returns a copy of this font whose glyphs are tinted (the original fonts are white).
  tinted(color) {
    this._t = this._t || {};
    if (this._t[color]) return this._t[color];
    const c = document.createElement('canvas'); c.width = this.img.width; c.height = this.img.height;
    const x = c.getContext('2d'); x.drawImage(this.img, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    const f = Object.create(this); f.img = c; this._t[color] = f; return f;
  }
  // multiply tint: keeps the dark outline baked into the glyphs (used by the tutorial text)
  multiplied(color) {
    this._m = this._m || {};
    if (this._m[color]) return this._m[color];
    const c = document.createElement('canvas'); c.width = this.img.width; c.height = this.img.height;
    const x = c.getContext('2d'); x.drawImage(this.img, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(this.img, 0, 0);
    const f = Object.create(this); f.img = c; this._m[color] = f; return f;
  }
  measure(text, scale = 1) {
    let w = 0, prev = null;
    for (const ch of text) {
      const code = ch.codePointAt(0);
      const c = this.chars[code] || this.chars[63];
      if (!c) continue;
      if (prev !== null) w += (this.kern[prev + ',' + code] || 0);
      w += c.xa; prev = code;
    }
    return w * scale;
  }
  // (x, y) is the anchor: align 'left'|'center'|'right' horizontally; vertically centered on the line.
  draw(ctx, text, x, y, o = {}) {
    const scale = o.scale ?? 1, align = o.align ?? 'center';
    const width = this.measure(text, scale);
    let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const top = y - (this.lineHeight * scale) / 2;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    let prev = null;
    for (const ch of text) {
      const code = ch.codePointAt(0);
      const c = this.chars[code] || this.chars[63];
      if (!c) continue;
      if (prev !== null) cx += (this.kern[prev + ',' + code] || 0) * scale;
      if (c.w > 0 && c.h > 0) ctx.drawImage(this.img, c.x, c.y, c.w, c.h, cx + c.xo * scale, top + c.yo * scale, c.w * scale, c.h * scale);
      cx += c.xa * scale; prev = code;
    }
    ctx.restore();
    return width;
  }
}
