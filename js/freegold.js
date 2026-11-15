// FreeGoldLayer (MenuLayer::onGold -> CCTransitionFade -> FreeGoldLayer::scene). Positions are the original game's own values (Frida scene dump
// of the running game), canvas px = (2x, 1013.333 - 2y) for layer coordinates (x, y).
import { Screen } from './screens.js';
import { recruit, enterCode } from './account.js';

const Y = (y) => 1013.333 - 2 * y;
const URL = { fb: 'http://www.robtopgames.com/boomlings/facebook', tw: 'http://www.robtopgames.com/boomlings/twitter', yt: 'http://www.robtopgames.com/boomlings/youtube' };
const SOCIAL = [['fb', 'longFacebookBtn_001.png', 398.17, 'sheet'], ['tw', 'longTwitterBtn_001.png', 361.17, 'sheet'], ['yt', 'longYouTubeBtn_001.png', 324.17, 'sheet'], ['rate', 'longRateBtn_001.png', 287.17, 'sheet2']];

export class FreeGoldScreen extends Screen {
  constructor(app) { super(app); this.pending = null; this.onFocus = () => this.returnedFromWeb(); window.addEventListener('focus', this.onFocus); }
  unlocked(k) { return !!(this.G.save.d.freeGold && this.G.save.d.freeGold[k]); }
  // FreeGoldLayer::onFacebook / onTwitter / onYouTube: remember which one, open the page; returnedFromWeb pays the reward once
  open(k) {
    this.pending = k;
    if (k === 'rate') { setTimeout(() => this.returnedFromWeb(), 0); return; }   // the offline build's page opener only "resumes" the app
    try { window.open(URL[k], '_blank', 'noopener'); } catch (e) { setTimeout(() => this.returnedFromWeb(), 0); }
  }
  // FreeGoldLayer::returnedFromWeb + giveRewardForWeb: kUnlock<X> once, 100 gold (200 for rating), "Gold Reward!" alert
  returnedFromWeb() {
    const k = this.pending; if (!k || this.app.top() !== this) return;
    this.pending = null;
    const d = this.G.save.d; d.freeGold = d.freeGold || {};
    if (d.freeGold[k]) return;
    d.freeGold[k] = true;
    const n = k === 'rate' ? 200 : 100;
    this.G.save.addGold(n);
    this.G.audio.play('buyGold001.ogg', 0.8);
    this.app.dialog('Gold Reward!', 'You have been rewarded <cg>' + n + '</c> <cy>Gold Coins</c>! Use gold to unlock things in the <cl>Store</c>!', [['OK', null]]);
  }
  // FreeGoldLayer::onClick -> GameAdManager::showTapJoyOffers, which the offline build replaces by Offline.claim("offers", 10 min) -> awardGold(25)
  offers() {
    if (this.G.store.claimOffline('offers', 600000)) { this.G.save.addGold(25); return; }
    this.app.dialog('Unavailable', 'No offers right now. Check back in 10 minutes!', [['OK', null]]);
  }
  update(dt) { super.update(dt); }
  leave() { window.removeEventListener('focus', this.onFocus); }
  // a button sprite (scaled s) with its bonus sprite as a child at (cx, cy) in the button's own (unscaled, y-up) point space
  item(ctx, atlas, name, bonusAtlas, bonus, x, y, s, cx, cy, fn) {
    const [w, h] = atlas.size(name), k = this.pscale(x - (w * s) / 2, y - (h * s) / 2, w * s, h * s);
    atlas.draw(ctx, name, x, y, { scale: s * k });
    const dx = (2 * cx - w / 2) * s * k, dy = -(2 * cy - h / 2) * s * k;
    bonusAtlas.draw(ctx, bonus, x + dx, y + dy, { scale: s * k });
    this.hits.add(x - (w * s) / 2, y - (h * s) / 2, w * s, h * s, fn);
  }
  draw(ctx) {
    const { menu, ui, save } = this.G, sheet2 = this.G.sheet2, f = this.f;
    this.hits.clear();
    this.bg(ctx);
    const topW = menu.size('longTopBar_001.png')[0];
    menu.draw(ctx, 'shopTopBG_001.png', 320, Y(346.67), { scaleX: topW / menu.size('shopTopBG_001.png')[0] });
    const bw = topW / menu.size('shopBottomBG2_001.png')[0];
    menu.draw(ctx, 'shopBottomBG2_001.png', 320, Y(201.67), { scaleX: bw });
    menu.draw(ctx, 'shopBottomBG2_001.png', 320, Y(108.67), { scaleX: bw });
    menu.draw(ctx, 'moreFreeGold_001.png', 320, Y(138.67));
    this.sprite(ctx, menu, 'backArrow_001.png', 40, -9.333, 1, () => this.app.back());
    menu.draw(ctx, 'longTopBar_001.png', 320, Y(441.67));
    for (const [k, name, ly, sh] of SOCIAL) {
      const atlas = sh === 'sheet2' ? sheet2 : menu, done = this.unlocked(k);
      const bonus = done ? ['menu', 'doneBonus_001.png'] : k === 'rate' ? ['sheet2', 'freeGoldBonus200_001.png'] : ['menu', 'freeGoldBonus_001.png'];
      this.item(ctx, atlas, name, bonus[0] === 'menu' ? menu : sheet2, bonus[1], 320, Y(ly), 0.9, 58, 23.5, () => this.open(k));
    }
    this.item(ctx, menu, 'longRecruitBtn_001.png', menu, 'freeGoldBonus2_001.png', 320, Y(214.67), 1, 58, 16.5, () => recruit(this.app));
    this.item(ctx, menu, 'longEnterRefBtn_001.png', menu, 'freeGoldBonus2_001.png', 320, Y(182.67), 1, 58, 16.5, () => enterCode(this.app));
    menu.draw(ctx, 'freeGoldLabel_001.png', 320, Y(441.67));
    menu.draw(ctx, 'recruitAFriendBar_001.png', 320, Y(246.67));
    menu.draw(ctx, 'IAPGold04_001.png', 320, Y(63.67));
    this.sprite(ctx, ui, 'freeBtn_001.png', 320, Y(105.67), 1, () => this.offers());
    this.coin(ctx, 609.4, -20, 66); f.gold.draw(ctx, String(save.gold | 0), 582, -9.333, { align: 'right', scale: 1 });
  }
}
