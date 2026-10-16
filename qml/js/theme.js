.pragma library

// ---------------------------------------------------------------------------
// Omarchy theme integration.
//
// Omarchy stages the active theme's palette at
//   ~/.local/state/omarchy/current/theme/colors.toml
// as flat one-line assignments, e.g.  background = "#1e1e2e".
// This module parses that file and maps it onto the game's color roles.
// Anything missing (or no file at all, e.g. under qmlscene on a
// non-Omarchy box) falls back to the game's built-in palette.
// ---------------------------------------------------------------------------

function withAlpha(hex, alpha) {
    // "#rrggbb" (or "#rgb") -> "#aarrggbb"
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return hex;
    var a = Math.round(alpha * 255).toString(16);
    if (a.length === 1) a = '0' + a;
    return '#' + a + h;
}

// Strip a `#` comment, but not a `#` inside quotes (hex colors!).
function stripComment(line) {
    var inSingle = false, inDouble = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"' && !inSingle) inDouble = !inDouble;
        else if (ch === "'" && !inDouble) inSingle = !inSingle;
        else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
    }
    return line;
}

function parseToml(text) {
    var out = {};
    if (!text) return out;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = stripComment(lines[i]).trim();
        if (!line) continue;
        var m = line.match(/^([A-Za-z0-9_.\-]+)\s*=\s*["']([^"']*)["']/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

function isHexColor(s) {
    return typeof s === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

function defaultTheme() {
    return loadTheme('');
}

function loadTheme(text) {
    var t = parseToml(text);
    function pick(key, fallback) {
        return isHexColor(t[key]) ? t[key] : fallback;
    }
    var felt = pick('background', '#22703e');
    var fg = pick('foreground', '#ffffff');
    return {
        felt: felt,                                  // table felt / window bg
        fg: fg,                                      // primary text
        dimFg: pick('foreground', '#d2f0d2'),        // labels, status text
        accent: pick('accent', '#ff8c00'),           // selection highlight
        blue: pick('blue', '#3c8cc8'),               // NEW GAME / UNDO / NO
        red: pick('red', '#be3232'),                 // YES / MUTE-off
        green: pick('green', '#3c785a'),             // MUTE-on / win message
        yellow: pick('yellow', '#ffff00'),           // message text / banner
        slotBorder: withAlpha(fg, 0.27),             // empty slot outlines
        barBorder: withAlpha(fg, 0.2)                // bottom bar outline
    };
}

// node test hook
if (typeof module !== 'undefined') {
    module.exports = {
        parseToml: parseToml,
        loadTheme: loadTheme,
        defaultTheme: defaultTheme,
        withAlpha: withAlpha
    };
}
