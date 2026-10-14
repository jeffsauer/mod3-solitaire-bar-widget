// node tests for qml/js/theme.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Load theme.js (strip the `.pragma library` line which node can't parse)
const src = readFileSync(join(root, 'qml/js/theme.js'), 'utf8')
    .replace(/^\.pragma library\s*$/m, '');
const mod = { exports: {} };
new Function('module', src)(mod);
const Theme = mod.exports;

let pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error('FAIL:', name); }
}

const sample = `
# a comment line
mode = "dark"
background = "#1e1e2e"
foreground = "#cdd6f4"
accent = "#89b4fa"
red = "#f38ba8"
green = "#a6e3a1"
yellow = "#f9e2af"
blue = "#89b4fa"
magenta = "#cba6f7"  # trailing comment
notacolor = "dark"
`;

// --- parseToml ---
{
    const t = Theme.parseToml(sample);
    ok(t.background === '#1e1e2e', 'parse: background');
    ok(t.accent === '#89b4fa', 'parse: accent');
    ok(t.mode === 'dark', 'parse: unquoted-ish value');
    ok(t.magenta === '#cba6f7', 'parse: trailing comment stripped');
    ok(!('' in t), 'parse: blank lines skipped');
    ok(Object.keys(Theme.parseToml('')).length === 0, 'parse: empty input');
    ok(Object.keys(Theme.parseToml(null)).length === 0, 'parse: null input');
}

// --- loadTheme ---
{
    const th = Theme.loadTheme(sample);
    ok(th.felt === '#1e1e2e', 'theme: felt from background');
    ok(th.fg === '#cdd6f4', 'theme: fg from foreground');
    ok(th.accent === '#89b4fa', 'theme: accent passthrough');
    ok(th.red === '#f38ba8', 'theme: red passthrough');
    ok(th.slotBorder === '#45cdd6f4', 'theme: slotBorder is fg at 27% alpha, got ' + th.slotBorder);

    // missing keys fall back to built-ins
    const th2 = Theme.loadTheme('background = "#111111"\n');
    ok(th2.felt === '#111111', 'theme: partial file keeps what it has');
    ok(th2.accent === '#ff8c00', 'theme: missing accent falls back');

    // non-color values are ignored
    const th3 = Theme.loadTheme('background = "dark"\n');
    ok(th3.felt === '#22703e', 'theme: non-hex background falls back');

    // empty -> all defaults
    const th4 = Theme.defaultTheme();
    ok(th4.felt === '#22703e' && th4.fg === '#ffffff', 'theme: defaults');
}

// --- withAlpha ---
{
    ok(Theme.withAlpha('#ffffff', 0.27) === '#45ffffff', 'alpha: white 27%');
    ok(Theme.withAlpha('#fff', 1) === '#ffffffff', 'alpha: short hex');
    ok(Theme.withAlpha('notacolor', 0.5) === 'notacolor', 'alpha: passthrough on bad input');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
