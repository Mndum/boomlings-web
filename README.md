# Boomlings web port

HTML5 canvas reimplementation of Boomlings 1.20. No server, no build step.

Run (must be served over http, not opened as file://):

    python -m http.server 8765 --directory boomlings-web
    # then open http://localhost:8765

Files
- js/rules.js   game rules transcribed from the decompiled libgame.so (scoring, spawning odds, grid, pathing)
- js/game.js    play scene: turn pipeline, chains, bombs, ice, pipes, skulls, mystery boxes, changers, levels
- js/main.js    menu, pause, game over, input, loop
- js/atlas.js, anim.js, bmfont.js, plist.js, audio.js   loaders for the original sprite sheets, animation descriptors, bitmap fonts and sounds
- assets/       original HD art, fonts and audio from the APK

Not ported: shop, powerups, gold spending, achievements, leaderboards, tutorial, icons.
Progress is saved only as the best score in localStorage.

The art and audio belong to RobTop Games. Keep this for personal use; do not publish it.

## UI layout source
HUD and menu screens use positions recovered from the decompiled layer code (UILayer, MenuLayer, PowerupSelectLayer,
GameShopLayer, PauseLayer, GameOverLayer, FLAlertLayer) in the game's 320x480 y-up point space, converted to the
640x960 canvas (x*2, y flipped). A few values that could not be recovered statically (game-over label x, shop page
inner offsets, extras tab spacing) are estimated by eye.
