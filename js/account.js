// Account / referral flows for the optional backend (api.js). Forms are plain DOM overlays (like the rename box); results use the game's own Dialog.
// a small modal form: fields = [{key, label, type, max, value}], buttons = [[label, key]] -> resolves {button, values} (button null = dismissed)
function form(title, fields, buttons) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:20;background:rgba(0,10,40,.6);display:flex;align-items:center;justify-content:center;font-family:Helvetica,Arial,sans-serif';
    const box = document.createElement('div');
    box.style.cssText = 'background:#0a3a8a;border:3px solid #fff;border-radius:14px;padding:18px;width:min(86vw,320px);color:#fff;box-sizing:border-box';
    const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'font:700 22px Helvetica,Arial;text-align:center;margin-bottom:12px'; box.appendChild(h);
    const inputs = {};
    for (const f of fields) {
      const l = document.createElement('div'); l.textContent = f.label; l.style.cssText = 'font-size:13px;margin:8px 0 3px;opacity:.85'; box.appendChild(l);
      const i = document.createElement('input'); i.type = f.type || 'text'; i.maxLength = f.max || 40; i.value = f.value || ''; i.autocomplete = f.type === 'password' ? 'current-password' : 'off';
      i.style.cssText = 'width:100%;box-sizing:border-box;font:700 17px Helvetica,Arial;padding:8px;border:2px solid #fff;border-radius:8px;background:#06285e;color:#fff'; box.appendChild(i); inputs[f.key] = i;
    }
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:16px';
    const finish = (b) => { wrap.remove(); const values = {}; for (const k in inputs) values[k] = inputs[k].value; resolve({ button: b, values }); };
    for (const [label, key] of buttons) {
      const b = document.createElement('button'); b.textContent = label;
      b.style.cssText = 'flex:1;font:700 16px Helvetica,Arial;padding:10px 4px;border:2px solid #fff;border-radius:10px;background:#1b78e0;color:#fff;cursor:pointer';
      b.onclick = () => finish(key); row.appendChild(b);
    }
    box.appendChild(row); wrap.appendChild(box);
    wrap.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') finish(null); else if (e.key === 'Enter') finish(buttons[0][1]); });
    document.body.appendChild(wrap);
    const first = Object.values(inputs)[0]; if (first) first.focus();
  });
}

const errText = (e) => (e && e.offline ? 'Could not reach the server.' : (e && e.message) || 'Something went wrong.');

export async function accountFlow(app) {
  const api = app.G.api;
  if (!api || !api.online) return app.netError();
  if (api.signedIn) return accountInfo(app);
  const r = await form('Account', [{ key: 'name', label: 'Name (3-12 letters / numbers)', max: 12, value: app.G.save.d.name === 'Player' ? '' : app.G.save.d.name }, { key: 'pw', label: 'Password (6+ characters)', type: 'password', max: 100 }], [['Log in', 'login'], ['Register', 'register'], ['Cancel', null]]);
  if (!r.button) return;
  const { name, pw } = r.values;
  try {
    if (r.button === 'register') {
      const c = await form('Referral code', [{ key: 'ref', label: 'Got a friend\'s code? (optional)', max: 8 }], [['Create account', 'ok'], ['Cancel', null]]);
      if (!c.button) return;
      await api.register(name, pw, c.values.ref.trim());
      app.G.save.d.name = api.user.name.slice(0, 12); app.G.save.flush();
      await api.claim();
      await api.syncAfterLogin(app);
      app.dialog('Welcome!', 'Account <cg>' + api.user.name + '</c> created. Your referral code is <cy>' + api.user.refCode + '</c>.', [['OK', null]]);
    } else {
      await api.login(name, pw);
      await api.claim();
      const how = await api.syncAfterLogin(app);
      if (how !== 'asked') app.dialog('Signed in', 'Welcome back, <cg>' + api.user.name + '</c>!' + (how === 'pulled' ? ' Your cloud save was loaded.' : ''), [['OK', null]]);
    }
  } catch (e) { app.dialog('Error', errText(e), [['OK', null]]); }
}

// the Discord log-in button, drawn in the game's style (232x80, centred on x, y)
export function discordBtn(ctx, G, x, y) {
  const w = 232, h = 80, r = 18, l = x - w / 2, t = y - h / 2;
  const path = () => { ctx.beginPath(); ctx.roundRect(l, t, w, h, r); };
  ctx.save();
  path(); ctx.fillStyle = '#1d2358'; ctx.fill();                       // dark outline
  ctx.beginPath(); ctx.roundRect(l + 4, t + 3, w - 8, h - 9, r - 4); const g = ctx.createLinearGradient(0, t, 0, t + h); g.addColorStop(0, '#8a95ff'); g.addColorStop(0.5, '#5865f2'); g.addColorStop(1, '#3a45c4'); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.roundRect(l + 8, t + 6, w - 16, 22, 12); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();   // gloss
  G.fonts.big.draw(ctx, 'DISCORD', x, y - 12, { scale: 0.58 });
  G.fonts.big.draw(ctx, 'LOG IN', x, y + 17, { scale: 0.5 });
  ctx.restore();
}

// Discord login (or linking, when already signed in); resolves true when it worked
export async function discordConnect(app) {
  const api = app.G.api;
  if (!api || !api.online) { app.netError(); return false; }
  if (!api.discordOn) { app.dialog('Discord', 'Discord login is not set up on this server yet.', [['OK', null]]); return false; }
  const wasIn = api.signedIn;
  try {
    await api.discordLogin(); await api.claim();
    if (wasIn) app.toast('Discord linked', 'Server scores are on');
    else {
      app.G.save.d.name = api.user.name.slice(0, 12); app.G.save.flush();
      const how = await api.syncAfterLogin(app);
      if (how !== 'asked') app.dialog('Signed in', 'Welcome, <cg>' + api.user.name + '</c>!' + (how === 'pulled' ? ' Your cloud save was loaded.' : ''), [['OK', null]]);
    }
    return true;
  } catch (e) { app.dialog('Discord', errText(e), [['OK', null]]); return false; }
}

function accountInfo(app) {
  const api = app.G.api, u = api.user;
  app.dialog('Account', 'Signed in as <cg>' + u.name + '</c>\nReferral code: <cy>' + u.refCode + '</c>', [
    ['Sync now', async () => { try { const r = await api.pushSave(); if (r && r.conflict) app.dialog('Cloud Save', 'The cloud save is newer.', [['Use Cloud', () => api.applyCloud(r.data, r.updatedAt)], ['Keep This', () => api.pushSave(true)]]); else app.toast('Synced', 'Saved to the cloud'); } catch (e) { app.dialog('Error', errText(e), [['OK', null]]); } }],
    ['Sign out', async () => { await api.logout(); app.toast('Signed out', ''); }],
    ['OK', null]]);
}

// "Recruit a Friend": show this account's referral code
export async function recruit(app) {
  const api = app.G.api;
  if (!api || !api.online) return app.netError();
  if (!api.signedIn) return accountFlow(app);
  try { await api.refresh(); } catch (e) { return app.dialog('Error', errText(e), [['OK', null]]); }
  const u = api.user;
  app.dialog('Recruit a Friend', 'Share your code <cy>' + u.refCode + '</c>. You both get <cg>100</c> <cy>Gold Coins</c> when a friend enters it! Friends recruited: <cg>' + (u.referrals || 0) + '</c>', [
    ['Copy code', () => { try { navigator.clipboard.writeText(u.refCode); } catch (e) { /* ignore */ } app.toast('Copied', u.refCode); }],
    ['OK', null]]);
  try { await api.claim(); } catch (e) { /* ignore */ }
}

// "Enter Ref ID"
export async function enterCode(app) {
  const api = app.G.api;
  if (!api || !api.online) return app.netError();
  if (!api.signedIn) return accountFlow(app);
  const r = await form('Enter Ref ID', [{ key: 'code', label: 'A friend\'s referral code', max: 8 }], [['Redeem', 'ok'], ['Cancel', null]]);
  if (!r.button) return;
  try { const j = await api.redeem(r.values.code); app.dialog('Gold Reward!', 'You have been rewarded <cg>' + (j.reward || 0) + '</c> <cy>Gold Coins</c>!', [['OK', null]]); }
  catch (e) { app.dialog('Error', errText(e), [['OK', null]]); }
}
