# Decompile -> web port status

Every game class found in libgame.so. "verified" = compared against emulator captures.

| Class | Members | Status |
|---|---|---|
| AStarGrid | 27 | ported (Grid BFS) |
| AStarNode | 28 | ported |
| AStarPathNode | 13 | ported |
| AchievementBar | 6 | approximated toast, NOT 1:1 |
| AchievementCell | 6 | ported |
| AchievementNotifier | 7 | approximated |
| AchievementsLayer | 4 | ported + verified |
| AdPopup | 12 | online only |
| AppDelegate | 35 | n/a (platform) |
| BaseMenuItem | 13 | to review (helper/base class) |
| BitmapFontCache | 5 | ported |
| BonusDropdown | 6 | MISSING |
| BoomHighscoreItem | 16 | to review (helper/base class) |
| BoomHighscoreList | 36 | ported |
| BoomHighscoreProtocol | 3 | to review (helper/base class) |
| BoomListLayer | 3 | to review (helper/base class) |
| BoomListView | 17 | to review (helper/base class) |
| BoomScore | 13 | to review (helper/base class) |
| BoomScrollLayer | 57 | ported (elastic paging) |
| BoomXPBar | 12 | ported (results) |
| ButtonSprite | 5 | ported |
| CCAlertCircle | 5 | MISSING |
| CCAnimateFrameCache | 9 | to review (helper/base class) |
| CCAnimatedSprite | 18 | to review (helper/base class) |
| CCCircleAlert | 3 | MISSING |
| CCCircleWave | 15 | MISSING |
| CCContentLayer | 3 | to review (helper/base class) |
| CCContentManager | 7 | to review (helper/base class) |
| CCCountdown | 6 | MISSING |
| CCCounterLabel | 13 | MISSING |
| CCExtenderNode | 1 | MISSING |
| CCIndexPath | 2 | to review (helper/base class) |
| CCLightFlash | 10 | MISSING |
| CCLightStrip | 13 | MISSING |
| CCMenuItemSpriteExtra | 16 | ported (press 1.26 bounce) |
| CCMenuItemToggler | 14 | to review (helper/base class) |
| CCPartAnimSprite | 19 | to review (helper/base class) |
| CCScrollLayerExt | 51 | to review (helper/base class) |
| CCScrollLayerExtDelegate | 6 | to review (helper/base class) |
| CCSpritePart | 3 | to review (helper/base class) |
| CCTableView | 64 | to review (helper/base class) |
| CCTableViewCell | 15 | to review (helper/base class) |
| CCTableViewDataSource | 2 | to review (helper/base class) |
| CCTableViewDelegate | 5 | to review (helper/base class) |
| CCUIEffect | 7 | MISSING |
| ChangeNameLayer | 20 | approximated (HTML input) |
| ColoredSection | 9 | to review (helper/base class) |
| ConfirmPurchaseLayer | 4 | approximated (generic dialog), NOT 1:1 |
| DS_Dictionary | 45 | to review (helper/base class) |
| DailyRewardLayer | 7 | ported (from code + screenshot) |
| EnterIDLayer | 25 | online only |
| EnterPromoLayer | 25 | online only |
| FBAuthDelegate | 2 | online only |
| FLAlertLayer | 18 | ported + verified |
| FLAlertLayerProtocol | 1 | to review (helper/base class) |
| FileOperation | 3 | n/a |
| FileSaveManager | 7 | n/a |
| FontObject | 5 | to review (helper/base class) |
| FreeGoldLayer | 24 | MISSING (needs ads/online; screen not ported) |
| FriendHighscoreCell | 6 | to review (helper/base class) |
| GManager | 13 | to review (helper/base class) |
| GameAdManager | 38 | online only |
| GameCell | 7 | to review (helper/base class) |
| GameKitManager | 82 | online only |
| GameManager | 181 | ported (rules); save/resume ported |
| GameOverLayer | 13 | ported from code, NOT captured against real |
| GamePiece | 68 | ported |
| GamePieceChanger | 4 | ported |
| GamePieceManager | 14 | ported |
| GamePieceSpawner | 5 | ported |
| GamePieceTS | 7 | ported |
| GamePieceTicker | 13 | ported |
| GameSaveManager | 12 | ported (localStorage) |
| GameShopDelegate | 1 | to review (helper/base class) |
| GameShopLayer | 38 | ported + verified (paging, elastic) |
| GameSocialManager | 45 | online only |
| GameSoundManager | 26 | ported |
| GameStatsManager | 26 | ported |
| GameStoreManager | 64 | ported |
| GameToolbox | 14 | to review (helper/base class) |
| GameTurnManager | 28 | ported (scoring verified on tutorial) |
| GameTutorialManager | 11 | ported + verified (steps, scores, dots/arrow/ring) |
| GridArrow | 8 | ported (dot wave) |
| HighscoreCell | 6 | ported |
| HighscoreItem | 13 | ported |
| HighscoreLayer | 4 | ported + verified (tabs, spinner) |
| IAPDescription | 7 | to review (helper/base class) |
| IconMenuItem | 15 | ported |
| IconPage | 3 | ported |
| IconPurchaseLayer | 4 | to review (helper/base class) |
| IconSelectLayer | 15 | ported + verified |
| IngameShop | 17 | PORTED (game.js: drawer, bounce-in, hide on first move, Ankh arm) |
| IngameShopButton | 8 | PORTED (folded into IngameShop) |
| JniHelperFunctions | 8 | n/a (platform) |
| LoadSaveLayer | 11 | MISSING (cloud save UI) |
| LoadingCircle | 15 | ported (spinner) |
| LoadingLayer | 8 | MISSING (boot screen) |
| LocalHighscoreItem | 12 | ported |
| LoopingSprite | 8 | to review (helper/base class) |
| MenuLayer | 25 | ported + verified |
| MoreGamesLayer | 4 | online only |
| MoreGamesManager | 16 | online only |
| MultilineBitmapFont | 10 | ported (richText) |
| ObjectManager | 11 | to review (helper/base class) |
| OpenSLEngine | 15 | n/a (platform) |
| OptionsLayer | 16 | ported + verified |
| PauseLayer | 19 | ported + verified |
| PlayLayer | 105 | ported (board, effects, score labels) |
| PowerupButton | 13 | ported (HUD) |
| PowerupInstance | 13 | ported |
| PowerupMenuItem | 15 | ported from code |
| PowerupPage | 3 | ported from code |
| PowerupSelectLayer | 26 | ported from code, NOT captured against real |
| PriceLabel | 6 | ported |
| PromoInterstitial | 7 | online only |
| PromoPopup | 6 | online only |
| RecruitLayer | 11 | online only |
| ShareLayer | 9 | online only |
| ShopItemLConsumable | 6 | ported |
| ShopItemLIAP | 6 | to review (helper/base class) |
| ShopItemLIcon | 8 | ported |
| ShopItemLPowerup | 7 | ported |
| ShopItemLayer | 18 | ported |
| SimpleAudioEngineOpenSL | 16 | n/a (platform) |
| SimpleGamePiece | 4 | to review (helper/base class) |
| SlideInLayer | 24 | ported |
| SlideInLayerDelegate | 1 | to review (helper/base class) |
| Slider | 12 | to review (helper/base class) |
| SliderThumb | 5 | to review (helper/base class) |
| SliderTouchLogic | 11 | to review (helper/base class) |
| SlotMenuItem | 10 | ported |
| SpinningBox | 12 | MISSING (mystery bonus screen) |
| SpriteAnimationManager | 24 | to review (helper/base class) |
| SpriteDescription | 5 | to review (helper/base class) |
| StatisticsLayer | 15 | ported + verified |
| StatsCell | 8 | ported |
| StatsLayer | 4 | to review (helper/base class) |
| StatsObject | 5 | ported |
| SupportLayer | 15 | MISSING (offline-capable screen) |
| TextArea | 27 | ported (richText) |
| TouchAction | 10 | to review (helper/base class) |
| TouchCallbackDelegate | 1 | to review (helper/base class) |
| TouchFilterDelegate | 6 | to review (helper/base class) |
| TouchFilterLayer | 17 | to review (helper/base class) |
| TutorialPopup | 7 | ported |
| UILayer | 38 | ported + verified (HUD) |
| _JNIEnv | 6 | to review (helper/base class) |
| __cxxabiv1 | 12 | to review (helper/base class) |
| cocos2d | 445 | to review (helper/base class) |
| frameValues | 1 | to review (helper/base class) |
