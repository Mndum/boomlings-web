// Fills in browser features older phones lack (iPhones on iOS 13-16, older Android WebViews). Imported first by main.js.
const P = CanvasRenderingContext2D.prototype;
if (!P.roundRect) {
  P.roundRect = function (x, y, w, h, r) {
    let [tl, tr, br, bl] = Array.isArray(r) ? [r[0], r[1] ?? r[0], r[2] ?? r[0], r[3] ?? r[1] ?? r[0]] : [r, r, r, r];
    [tl, tr, br, bl] = [tl, tr, br, bl].map((v) => Math.max(0, Math.min(+v || 0, Math.abs(w) / 2, Math.abs(h) / 2)));
    this.moveTo(x + tl, y); this.lineTo(x + w - tr, y); this.arcTo(x + w, y, x + w, y + tr, tr);
    this.lineTo(x + w, y + h - br); this.arcTo(x + w, y + h, x + w - br, y + h, br);
    this.lineTo(x + bl, y + h); this.arcTo(x, y + h, x, y + h - bl, bl);
    this.lineTo(x, y + tl); this.arcTo(x, y, x + tl, y, tl); this.closePath();
  };
}
if (!Array.prototype.at) {
  const at = function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n < 0 || n >= this.length ? undefined : this[n]; };
  Object.defineProperty(Array.prototype, 'at', { value: at, writable: true, configurable: true });
  Object.defineProperty(String.prototype, 'at', { value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n < 0 || n >= this.length ? undefined : this.charAt(n); }, writable: true, configurable: true });
}
if (!String.prototype.replaceAll) Object.defineProperty(String.prototype, 'replaceAll', { value: function (a, b) { return a instanceof RegExp ? this.replace(a, b) : this.split(a).join(b); }, writable: true, configurable: true });
if (!Object.hasOwn) Object.hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
if (typeof structuredClone !== 'function') window.structuredClone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
