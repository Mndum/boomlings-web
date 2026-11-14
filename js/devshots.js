// dev helper: window.shots(['hs','opts',...]) saves canvas snapshots for pixel comparison against the real game
export async function init() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { G, app } = window.__boom, S = await import('/js/screens.js'), E = await import('/js/extras.js');
  G.save.d.opts.mv = 1; G.save.d.opts.sv = 1; G.save.d.name = 'Player'; G.save.d.icon = 'kIcon_001'; G.save.d.rank = 1;
  // advance the game by `sec` of simulated time and redraw (works even when the browser pane is hidden and rAF is paused)
  const canvas = document.querySelector('canvas'), cx = canvas.getContext('2d');
  window.advance = (sec) => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      const dt = 1 / 60;
      if (app.fade) { const f = app.fade; f.t += dt; if (!f.did && f.t >= 0.25) { f.did = true; f.fn(); } if (f.t >= 0.5) app.fade = null; }
      const top = app.top(); if (top) top.update(dt);
      const play = app.stack.find((q) => q.scene && q.constructor.name === 'PlayScreen');
      if (top && play && top.constructor.name === 'Dialog' && !G.scene.paused) G.scene.update(dt);
      if (G.fx) G.fx.update(dt);
    }
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#071a42'; cx.fillRect(0, 0, 640, 1066); cx.save(); cx.translate(0, 53);
    const top = app.top(); if (top) top.draw(cx); if (G.fx) G.fx.draw(cx);
    if (app.fade) { const f = app.fade, a = f.t < 0.25 ? f.t / 0.25 : 1 - (f.t - 0.25) / 0.25; cx.fillStyle = 'rgba(0,0,0,' + Math.max(0, Math.min(1, a)) + ')'; cx.fillRect(0, -53, 640, 1066); }
    cx.restore();
  };
  window.mk = { menu: () => null, hub: () => new E.ExtrasScreen(app), stats: () => new E.StatsPanel(app), ach: () => new E.AchPanel(app), opts: () => new E.OptionsPanel(app), hs: () => new app.Highscores(app), continue: () => new E.ContinuePanel(app),
    tut: async () => { G.save.d.tut = {}; app.beginGame(1); window.advance(1.5); await wait(800); window.advance(1.5); return null; },
    tutgame: async () => { G.save.d.tut = {}; app.beginGame(1); window.advance(1.5); await wait(800); window.advance(1.5); const t = app.top(); if (t && t.close) t.close(); window.advance(1.6); return null; },
    pw: () => new S.PowerSelectScreen(app),
    results: async () => { app.beginGame(1); window.advance(1.5); const sum = { score: 177, gold: 2, base: 2, xpGain: 88, xpNow: 88, rankBefore: 1, rankAfter: 1, level: 1, newBest: true }; const sc = new S.ResultsScreen(app, G.scene, sum); app.fade = null; app.stack = [app.stack[0], sc]; sc.tab = 'friends'; sc.t = Math.PI * 33 / 5.2; sc.update(0); sc.update = () => {}; return null; },
    store: () => new S.ShopScreen(app),
    pause: async () => { app.beginGame(1); window.advance(2.2); G.scene.playTime = 86; app.pause(); return null; },
    pausedlg: async () => { app.beginGame(1); window.advance(2.2); G.scene.playTime = 86; app.pause(); window.advance(0.6); app.top().confirmMenu(); return null; },
    dialog: () => { app.netError(); return null; } };
  window.shots = async (names) => {
    const r = {};
    for (const n of names) { app.fade = null; app.stack = [new S.MenuScreen(app)];  const s = await window.mk[n](); if (s) app.stack.push(s); window.advance(2.4); r[n] = await window.snap(n); }
    return r;
  };
}
