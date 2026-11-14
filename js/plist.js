// Minimal Apple plist (XML) parser -> plain JS values.
export function parsePlist(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const root = doc.querySelector('plist > *');
  if (!root) throw new Error('bad plist');
  return convert(root);
}
function convert(el) {
  switch (el.tagName) {
    case 'dict': {
      const out = {};
      const kids = Array.from(el.children);
      for (let i = 0; i + 1 < kids.length; i += 2) out[kids[i].textContent] = convert(kids[i + 1]);
      return out;
    }
    case 'array': return Array.from(el.children).map(convert);
    case 'string': return el.textContent;
    case 'integer': return parseInt(el.textContent, 10);
    case 'real': return parseFloat(el.textContent);
    case 'true': return true;
    case 'false': return false;
    default: return el.textContent;
  }
}
// "{{x,y},{w,h}}" -> [x,y,w,h]; "{a,b}" -> [a,b]
export function parseNumbers(s) {
  return String(s).match(/-?\d+(\.\d+)?/g).map(Number);
}
export async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch failed ' + url);
  return r.text();
}
export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image failed ' + url));
    img.src = url;
  });
}
