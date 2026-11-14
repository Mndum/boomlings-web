// Small immediate-mode UI toolkit used by every menu screen. Coordinates are canvas pixels (640x960).
export const W = 640, H = 960;
// The real game runs a 320x480-point design area on a taller 480x800 phone: scaled x1.5 with 40px bands above and below.
// The canvas covers the whole phone screen (CH) and the design area is drawn at offset OY.
export const CH = 1066, OY = 53;
const TAG = { cg: '#40e348', cy: '#ffff00', cl: '#5cc8ff', cr: '#ff6a5a' };

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// "<cg>green</c> text" -> [{text, color}]
function parseRich(str) {
  const out = []; let color = null;
  const re = /<(c[gylr])>|<\/c>|([^<]+)|</g; let m;
  while ((m = re.exec(str))) {
    if (m[1]) color = TAG[m[1]]; else if (m[0] === '</c>') color = null; else out.push({ text: m[2] ?? '<', color });
  }
  return out;
}
// Draws wrapped rich text. Returns the height used. align: 'left' | 'center'
export function richText(ctx, font, str, x, y, o = {}) {
  const scale = o.scale ?? 0.8, maxW = o.maxWidth ?? 400, lh = (o.lineHeight ?? font.lineHeight * scale * 0.95);
  const words = [];
  for (const seg of parseRich(String(str))) {
    for (const part of seg.text.split(/(\s+)/)) {
      if (part === '') continue;
      if (part.includes('\n')) { const sp = part.split('\n'); if (sp[0]) words.push({ text: sp[0], color: seg.color }); for (let i = 0; i < sp.length - 1; i++) words.push({ nl: true }); continue; }
      words.push({ text: part, color: seg.color });
    }
  }
  const lines = [[]]; let w = 0;
  for (const wd of words) {
    if (wd.nl) { lines.push([]); w = 0; continue; }
    const ww = font.measure(wd.text, scale);
    if (w + ww > maxW && lines[lines.length - 1].length && wd.text.trim()) { lines.push([]); w = 0; }
    if (!w && !wd.text.trim()) continue;
    lines[lines.length - 1].push({ ...wd, ww }); w += ww;
  }
  let cy = y;
  for (const ln of lines) {
    const total = ln.reduce((s, t) => s + t.ww, 0);
    let cx = o.align === 'center' ? x - total / 2 : x;
    for (const t of ln) { (t.color ? (o.mult ? font.multiplied(t.color) : font.tinted(t.color)) : font).draw(ctx, t.text, cx, cy, { scale, align: 'left', alpha: o.alpha }); cx += t.ww; }
    cy += lh;
  }
  return lines.length * lh;
}

// Per-frame hit regions. A screen builds this while drawing, taps are resolved against the previous frame.
export class Hits {
  constructor() { this.list = []; }
  clear() { this.list = []; }
  add(x, y, w, h, fn, tag, clip) { this.list.push({ x, y, w, h, fn, tag, clip }); }
  hit(px, py) { for (let i = this.list.length - 1; i >= 0; i--) { const b = this.list[i]; if (b.clip && !b.clip.inside(px, py)) continue; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b; } return null; }
}

// Vertical drag/wheel scrolling area with tap detection.
export class ScrollArea {
  constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; this.off = 0; this.contentH = h; this.vel = 0; this.drag = null; this.moved = false; this.rows = []; }
  get max() { return Math.max(0, this.contentH - this.h); }
  clamp() { this.off = Math.max(0, Math.min(this.max, this.off)); }
  inside(px, py) { return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }
  down(px, py) { if (!this.inside(px, py)) return false; this.drag = { y: py, off: this.off, sy: py }; this.moved = false; this.vel = 0; return true; }
  move(px, py) { if (!this.drag) return; const dy = py - this.drag.sy; if (Math.abs(dy) > 10) this.moved = true; if (this.moved) { this.off = this.drag.off - dy; this.clamp(); } }
  up() { const was = this.moved; this.drag = null; this.moved = false; return !was; } // returns true if it was a tap
  wheel(dy) { this.off += dy; this.clamp(); }
  begin(ctx) { ctx.save(); ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip(); ctx.translate(this.x, this.y - this.off); }
  end(ctx) { ctx.restore(); }
  scrollbar(ctx) {
    if (this.max <= 0) return;
    const bh = Math.max(40, this.h * this.h / this.contentH), by = this.y + (this.h - bh) * (this.off / this.max);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(ctx, this.x + this.w - 8, by, 6, bh, 3); ctx.fill();
  }
}

export function panel(ctx, x, y, w, h, o = {}) {
  roundRect(ctx, x, y, w, h, o.r ?? 16);
  ctx.fillStyle = o.fill ?? 'rgba(8,28,70,0.72)'; ctx.fill();
  ctx.lineWidth = o.lw ?? 3; ctx.strokeStyle = o.stroke ?? 'rgba(110,190,255,0.7)'; ctx.stroke();
}
// Button drawn from an atlas frame with a tap region. Returns nothing; registers a hit.
export function spriteBtn(hits, ctx, atlas, name, x, y, scale, fn, o = {}) {
  atlas.draw(ctx, name, x, y, { scale: o.pressed ? scale * 0.94 : scale, alpha: o.alpha });
  const [w, h] = atlas.size(name);
  hits.add(x - (w * scale) / 2, y - (h * scale) / 2, w * scale, h * scale, fn);
}
// Pill-shaped text button
export function pillBtn(hits, ctx, font, text, x, y, w, h, fn, o = {}) {
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  const base = o.color ?? ['#4db8ff', '#1668c8'];
  g.addColorStop(0, o.disabled ? '#667' : base[0]); g.addColorStop(1, o.disabled ? '#445' : base[1]);
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2.4); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = o.disabled ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)'; ctx.stroke();
  font.draw(ctx, text, x, y + 1, { scale: o.scale ?? 0.6, alpha: o.disabled ? 0.6 : 1 });
  if (fn && !o.disabled) hits.add(x - w / 2, y - h / 2, w, h, fn);
}
