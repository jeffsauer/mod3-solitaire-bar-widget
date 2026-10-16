# mod3_solitaire_qml

QML port of **Mod3 Solitaire** (the Mod3 variation from KDE kpatience),
originally written in V with the `gg`/sokol backend. This version is an
[Omarchy](https://omarchy.org/) **bar widget plugin**: a ♠ button in the
Quattro bar opens the game in a panel. It also runs as a standalone
Quickshell window or under plain Qt Quick (`qmlscene`).

Two decks, 32 slots in a 4×8 grid. Build same-suit sequences in rows 1–3:

- Row 1: 2 – 5 – 8 – J
- Row 2: 3 – 6 – 9 – Q
- Row 3: 4 – 7 – 10 – K

Row 4 is the waste row: any single card may rest in an empty slot. Click the
talon to deal fresh cards across row 4. Click a card to select it, then click a
target slot — or double-click a card to auto-play it to a valid target.

## Layout

```
manifest.json      Omarchy plugin manifest (bar-widget)
BarWidget.qml      Bar entry point: ♠ button, toggles the game panel
Panel.qml          Game panel (anchored to the bar button, Escape closes)
shell.qml          Standalone Quickshell entry point (regular desktop window;
                   must stay at the repo root — quickshell -c loads
                   <config dir>/shell.qml)
qml/
  Game.qml           The game UI (pure QtQuick — also runs under qmlscene)
  CardView.qml       Card image component
  FlyingCard.qml     Animated card-flight overlay
  GameButton.qml     Side-panel button
  js/
    gamelogic.js     Game rules + state (.pragma library, no Qt dependencies)
    solver_worker.js Background win-solver (WorkerScript entry, self-contained)
PNG-cards-1.3/       Card artwork (individual PNGs; the atlas is unused here)
sounds/              card_flip.wav
tests/
  test_logic.mjs     Node unit tests for the game logic + solver
```

## Running

**As an Omarchy bar widget plugin:**

```sh
omarchy plugin add https://github.com/jeffsauer/mod3_solitaire_qml.git --enable
```

Click the ♠ in the bar to open the game panel; Escape or the EXIT button
closes it. Move it between bar sections with:

```sh
omarchy bar move io.github.jeffsauer.mod3-solitaire --section right
```

Requires the `qt6-multimedia` QML module for the card-flip sound.

**As a standalone Quickshell window** (Omarchy / Hyprland):

```sh
mkdir -p ~/.config/quickshell
cp -r /path/to/mod3_solitaire_qml ~/.config/quickshell/mod3-solitaire
quickshell -c mod3-solitaire
```

Requires the `qt6-multimedia` QML module for the card-flip sound.

**Under plain Qt Quick** (for testing without Quickshell):

```sh
qmlscene qml/Game.qml
```

`Game.qml` imports nothing Quickshell-specific, so it runs anywhere QtQuick
does. `shell.qml` is just a thin `FloatingWindow` wrapper.

## Theming

On Omarchy, the game follows the active desktop theme. `shell.qml` watches
`~/.local/state/omarchy/current/theme/colors.toml` (the staged palette
Omarchy regenerates on every theme switch) and maps its `background`,
`foreground`, `accent`, `red`, `green`, `blue` and `yellow` onto the felt,
text, buttons and selection highlight — switching themes re-skins the game
live, no restart. The parsing lives in `qml/js/theme.js` (tested by
`tests/test_theme.mjs`). If the file is absent (e.g. plain `qmlscene` on a
non-Omarchy box), the built-in green-felt palette is used.

## Tests

The game logic and the solver are plain JavaScript, tested with node:

```sh
node tests/test_logic.mjs
```

The QML files pass `qmllint` (Qt 6.4). Note: `WorkerScript` in `Game.qml`
warns under `qmllint` because this toolchain's type database doesn't ship its
entry — it resolves fine at runtime (QtQml auto-imports it).

## Porting notes

- Faithful port of `mod3.v`: same layout numbers (1015×864 design board,
  scaled to the window), same rules, same messages, same victory physics,
  same bounded-DFS solver (20,000 states) now running in a `WorkerScript`
  instead of a V thread.
- One behavior carried over verbatim from the V version that looks like a
  bug: clicking the talon deals one card onto **every** row-4 slot, including
  ones that already hold a card (the automatic refill after moves correctly
  targets only empty slots). Preserved as-is; change `dealFromTalon` in
  `qml/js/gamelogic.js` if you'd rather the talon only filled empty slots.
- Double-click auto-play uses the same 350 ms manual detection as the V
  version (QML's `MouseArea.onDoubleClicked` would also fire the two
  underlying clicks, so the timing check is done by hand).
- Card art is loaded from the individual PNGs; the game no longer needs the
  generated atlas.
