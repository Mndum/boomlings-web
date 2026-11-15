import { parsePlist, fetchText } from './plist.js';
import { POW_TAGS } from './save.js';

// Shop catalog. The original embedded this XML in libgame.so; it is stored verbatim in data/store.plist.
export class Store {
  constructor(data, save, ach) {
    this.save = save; this.ach = ach;
    this.icons = Object.entries(data.Icons).filter(([, v]) => v && typeof v === 'object')
      .map(([id, v]) => ({ id, title: v.title, desc: v.description, price: +(v.price || 0), free: v.isFree === 'YES', unlockedBy: v.unlockedBy && v.unlockedBy !== '0' ? v.unlockedBy : null, index: +id.split('_')[1] }))
      // boomIcon_01..59 exist in the APK (boomIcon_00 is the '?' placeholder); later icons were downloaded from the server
      .filter((i) => i.index <= 59);
    this.items = Object.entries(data).filter(([k, v]) => k.startsWith('kItem') && v && typeof v === 'object')
      .map(([id, v]) => ({ id, feature: v.featureID, title: v.title, desc: v.description, price: +v.price, count: +v.count, icon: v.iconName }));
    this.pows = POW_TAGS.map((tag) => ({
      tag, ranks: Object.values(data[tag].ranks).map((r, i) => ({ id: r.featureID, rank: i + 1, title: r.title, desc: r.description, price: +r.price, icon: r.iconName, usable: r.usable === '1', charges: +(r.charges || 0) })),
    }));
    this.slotDefs = Object.values(data.kPowerupSlot.ranks).map((r, i) => ({ id: r.featureID, n: i + 1, title: r.title, price: +r.price }));
  }
  static async load(save, ach) {
    const data = parsePlist(await fetchText('data/store.plist'));
    return new Store(data, save, ach);
  }
  pow(tag) { return this.pows.find((p) => p.tag === tag); }
  // ---- purchases. Each returns { ok, msg } ----
  canAfford(price) { return this.save.gold >= price; }
  buyIcon(icon) {
    const s = this.save.d;
    if (s.icons.includes(icon.id)) return { ok: false, msg: 'Already unlocked.' };
    if (icon.unlockedBy) return { ok: false, msg: 'Unlocked by achievement.' };
    if (!this.canAfford(icon.price)) return { ok: false, msg: 'Not enough Gold' };
    s.gold -= icon.price; s.icons.push(icon.id); this.save.flush();
    this.ach.onIconCollected(true);
    return { ok: true };
  }
  unlockIconByAch(achId) {
    const s = this.save.d; let got = null;
    for (const i of this.icons) if (i.unlockedBy === achId && !s.icons.includes(i.id)) { s.icons.push(i.id); got = i; }
    if (got) { this.save.flush(); this.ach.onIconCollected(false); }
    return got;
  }
  buyItem(item) {
    if (!this.canAfford(item.price)) return { ok: false, msg: 'Not enough Gold' };
    const s = this.save.d; s.gold -= item.price; s.items[item.feature] = (s.items[item.feature] || 0) + item.count; this.save.flush();
    return { ok: true };
  }
  buyPow(tag, rank) {
    const p = this.pow(tag), r = p.ranks[rank - 1], s = this.save.d;
    if ((s.pow[tag] || 0) >= rank) return { ok: false, msg: 'Already owned.' };
    if ((s.pow[tag] || 0) !== rank - 1) return { ok: false, msg: 'Buy the previous rank first.' };
    if (!this.canAfford(r.price)) return { ok: false, msg: 'Not enough Gold' };
    s.gold -= r.price; s.pow[tag] = rank; this.save.flush();
    this.ach.onPowBought(rank);
    return { ok: true };
  }
  buySlot(n) {
    const s = this.save.d, def = this.slotDefs[n - 1];
    if (s.slots >= n) return { ok: false, msg: 'Already owned.' };
    if (s.slots !== n - 1) return { ok: false, msg: 'Buy the previous slot first.' };
    if (!this.canAfford(def.price)) return { ok: false, msg: 'Not enough Gold' };
    s.gold -= def.price; s.slots = n; this.save.flush();
    return { ok: true };
  }
  // Offline.claim(key, cooldownMs): true (and remembers now) once the cooldown has passed (the offline build's SharedPreferences "offline_rewards")
  claimOffline(key, cooldownMs) {
    const c = (this.save.d.offlineClaims ||= {}), now = Date.now();
    if (now - (c[key] || 0) < cooldownMs) return false;
    c[key] = now; this.save.flush(); return true;
  }
  // Offline replacement for the server-side "daily reward" (kept for the DailyRewardLayer screen; the menu button now follows the offline patch above)
  // GameSocialManager::getDailyReward + DailyRewardLayer. The server kept a running count of daily logins; every new
  // day the player collects the count goes up by one (Day 1 the first time) and DailyRewardLayer clamps it to 4.
  // goldForCount: days 1..3 pay 25 / 50 / 100, day 4 and later pay 200.
  static DAILY = [25, 50, 100, 200];
  dailyAvailable() { return this.save.d.daily !== new Date().toDateString(); }
  dailyCount() { const d = this.save.d; return d.dailyCount ?? (d.daily ? 1 : 0); }
  goldForCount(n) { return Store.DAILY[Math.min(4, Math.max(1, n)) - 1]; }
  // Returns what the server reply would be: isNew (a reward was just granted), the clamped day and the gold for it.
  claimDaily() {
    const d = this.save.d, isNew = this.dailyAvailable();
    if (isNew) { d.dailyCount = this.dailyCount() + 1; d.daily = new Date().toDateString(); }
    const day = Math.min(4, Math.max(1, this.dailyCount())), gold = this.goldForCount(day);
    if (isNew) this.save.addGold(gold); else this.save.flush();
    return { isNew, day, gold };
  }
}
