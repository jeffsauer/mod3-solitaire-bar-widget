// node tests for qml/js/gamelogic.js and qml/js/solver_worker.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Load gamelogic.js (strip the `.pragma library` line which node can't parse)
let src = readFileSync(join(root, 'qml/js/gamelogic.js'), 'utf8')
    .replace(/^\.pragma library\s*$/m, '');
const Logic = new Function(src + '\nreturn { ' + [
    'SUIT_HEARTS', 'SUIT_DIAMONDS', 'SUIT_CLUBS', 'SUIT_SPADES', 'SUIT_NAMES',
    'COLS', 'ROWS', 'SLOTS', 'DESIGN_W', 'DESIGN_H', 'CARD_W', 'CARD_H',
    'CARD_MARGIN', 'START_X', 'START_Y', 'STACK_OFF_X', 'STACK_OFF_Y',
    'rowY', 'slotX', 'sideX', 'talonY', 'pileCardPos', 'makeCard', 'cardImageName',
    'cardLabel', 'newGameState', 'isBoardEmpty', 'undoLastMove', 'isValidMove', 'findAutoTarget',
    'executeMove', 'dealFromTalon', 'handleGridClick', 'checkWinCondition',
    'beginVictory', 'stepVictory', 'serializeForSolver',
].join(',') + ' };')();

const require = createRequire(import.meta.url);
const Solver = require(join(root, 'qml/js/solver_worker.js'));

let pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error('FAIL:', name); }
}
function card(s, r) { return { suit: s, rank: r }; }
const H = Logic.SUIT_HEARTS, D = Logic.SUIT_DIAMONDS, C = Logic.SUIT_CLUBS, S = Logic.SUIT_SPADES;

// --- new game ---
{
    const { state, dealt } = Logic.newGameState();
    ok(state.grid.length === 32, 'newGame: 32 slots');
    ok(state.grid.every(p => p.length === 1), 'newGame: 1 card per slot');
    ok(state.deck.length === 64, 'newGame: 64 in talon (96-32)');
    ok(dealt.length === 32, 'newGame: 32 deal events');
    const counts = {};
    const all = [...state.deck, ...state.grid.flat()];
    ok(all.length === 96, 'newGame: 96 cards total (2 decks x 4 suits x 12 ranks)');
    for (const cd of all) counts[cd.suit + ':' + cd.rank] = (counts[cd.suit + ':' + cd.rank] || 0) + 1;
    ok(Object.values(counts).every(n => n === 2), 'newGame: every card appears exactly twice');
    ok(all.every(cd => cd.rank >= 2 && cd.rank <= 13), 'newGame: ranks 2..13, no aces');
    ok(state.message.includes('New Game'), 'newGame: message');
}

// --- board emptiness (startup state / new-game confirmation gate) ---
{
    ok(Logic.isBoardEmpty(null), 'isBoardEmpty: null state is empty');
    const { state } = Logic.newGameState();
    ok(!Logic.isBoardEmpty(state), 'isBoardEmpty: dealt game is not empty');
    state.grid = Array.from({ length: 32 }, () => []);
    ok(Logic.isBoardEmpty(state), 'isBoardEmpty: all piles empty');
    state.grid[17] = [card(H, 2)];
    ok(!Logic.isBoardEmpty(state), 'isBoardEmpty: one card anywhere is not empty');
}

// --- move rules ---
{
    const { state } = Logic.newGameState();
    state.grid = Array.from({ length: 32 }, () => []);
    // row 0 base
    ok(Logic.isValidMove(state, card(H, 2), 0, 0), 'rules: row0 empty takes 2');
    ok(!Logic.isValidMove(state, card(H, 3), 0, 0), 'rules: row0 empty rejects 3');
    ok(!Logic.isValidMove(state, card(H, 2), 1, 0), 'rules: row1 empty rejects 2');
    ok(Logic.isValidMove(state, card(H, 3), 1, 0), 'rules: row1 empty takes 3');
    ok(Logic.isValidMove(state, card(H, 4), 2, 0), 'rules: row2 empty takes 4');
    // sequence building: 2H,5H then 8H ok / 8S wrong suit / 9H wrong rank
    state.grid[0] = [card(H, 2), card(H, 5)];
    ok(Logic.isValidMove(state, card(H, 8), 0, 0), 'rules: 8H continues 2H,5H');
    ok(!Logic.isValidMove(state, card(S, 8), 0, 0), 'rules: 8S wrong suit rejected');
    ok(!Logic.isValidMove(state, card(H, 9), 0, 0), 'rules: 9H wrong rank rejected');
    // full pile of 4 rejects
    state.grid[1] = [card(H, 3), card(H, 6), card(H, 9), card(H, 12)];
    ok(!Logic.isValidMove(state, card(H, 15), 1, 1), 'rules: full pile rejects');
    // row 3: any card into empty slot only
    ok(Logic.isValidMove(state, card(S, 14), 3, 5), 'rules: row3 empty takes anything');
    state.grid[3 * 8 + 5] = [card(S, 14)];
    ok(!Logic.isValidMove(state, card(H, 2), 3, 5), 'rules: row3 occupied rejects');
}

// --- executeMove + undo ---
{
    const { state } = Logic.newGameState();
    state.grid = Array.from({ length: 32 }, () => []);
    state.deck = [];
    state.grid[3 * 8 + 0] = [card(H, 2)];   // waste slot with 2H on top
    const evs = Logic.executeMove(state, 3, 0, 0, 0);
    ok(state.grid[0].length === 1 && state.grid[0][0].rank === 2, 'move: card landed');
    ok(state.grid[3 * 8].length === 0, 'move: source emptied');
    ok(state.moveCount === 1, 'move: moveCount=1');
    ok(evs[0].kind === 'move' && evs[0].toR === 0 && evs[0].toC === 0, 'move: event emitted');
    ok(Logic.undoLastMove(state), 'undo: returns true');
    ok(state.grid[3 * 8].length === 1 && state.grid[0].length === 0, 'undo: grid restored');
    ok(state.moveCount === 0, 'undo: moveCount restored');
    ok(!Logic.undoLastMove(state), 'undo: empty stack returns false');
}

// --- auto-fill after move ---
{
    const { state } = Logic.newGameState();
    state.grid = Array.from({ length: 32 }, () => []);
    state.deck = [card(D, 7)];               // one card left in talon
    state.grid[3 * 8 + 0] = [card(H, 2)];
    const evs = Logic.executeMove(state, 3, 0, 0, 0);
    ok(state.grid[3 * 8].length === 1 && state.grid[3 * 8][0].rank === 7, 'autofill: talon refilled row4');
    ok(evs.some(e => e.kind === 'fill'), 'autofill: fill event emitted');
}

// --- dealFromTalon ---
{
    const { state } = Logic.newGameState();
    state.grid = Array.from({ length: 32 }, () => []);
    state.deck = [card(H, 9), card(D, 9), card(C, 9)];
    const evs = Logic.dealFromTalon(state);
    ok(evs.length === 3, 'deal: 3 fill events');
    ok(state.grid[3 * 8].length === 1 && state.grid[3 * 8 + 1].length === 1, 'deal: row4 slots filled');
    ok(state.deck.length === 0, 'deal: talon drained');
    const evs2 = Logic.dealFromTalon(state);
    ok(evs2.length === 0 && state.message === 'Talon is empty!', 'deal: empty talon message');
}

// --- findAutoTarget ---
{
    const { state } = Logic.newGameState();
    state.grid = Array.from({ length: 32 }, () => []);
    state.deck = [];
    state.grid[0] = [card(H, 2), card(H, 5)];   // row0 col0 building hearts
    state.grid[3 * 8 + 3] = [card(H, 8)];       // waste
    const t = Logic.findAutoTarget(state, card(H, 8), 3, 3);
    ok(t[0] === 0 && t[1] === 0, 'autotarget: finds sequence slot');
    const t2 = Logic.findAutoTarget(state, card(S, 14), 3, 4);
    ok(t2[0] === -1, 'autotarget: no target for ace of spades on empty board');
}

// --- double-click auto-play via handleGridClick ---
{
    const { state } = Logic.newGameState();
    state.grid = Array.from({ length: 32 }, () => []);
    state.deck = [];
    state.grid[0] = [card(H, 2)];
    state.grid[3 * 8 + 3] = [card(H, 5)];
    Logic.handleGridClick(state, 3, 3, 1000);          // single click: select
    ok(state.selectedR === 3 && state.selectedC === 3, 'click: selects card');
    const evs = Logic.handleGridClick(state, 3, 3, 1200); // double-click: auto-play
    ok(state.grid[0].length === 2, 'dblclick: 5H auto-played onto 2H');
    ok(evs.length > 0 && evs[0].kind === 'move', 'dblclick: move event');
    // invalid manual move
    state.grid[3 * 8 + 4] = [card(S, 9)];
    Logic.handleGridClick(state, 3, 4, 5000);
    Logic.handleGridClick(state, 0, 1, 5100);
    ok(state.message.includes('Invalid move'), 'click: invalid move message');
}

// --- win detection ---
{
    const { state } = Logic.newGameState();
    state.grid = Array.from({ length: 32 }, () => []);
    state.deck = [];
    const seq = (r, s) => [2 + r, 2 + r + 3, 2 + r + 6, 2 + r + 9].map(rank => card(s, rank));
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++)
            state.grid[r * 8 + c] = seq(r, (r + c) % 4);
    const evs = [];
    ok(Logic.checkWinCondition(state, evs), 'win: detected');
    ok(state.isWon, 'win: isWon set');
    ok(evs.length === 1 && evs[0].kind === 'win', 'win: win event');
    ok(evs[0].cards.length === 96, 'win: 96 victory cards');
    ok(state.grid.every(p => p.length === 0), 'win: grid cleared for animation');
}

// --- victory physics settles ---
{
    const cards = [{ suit: 0, rank: 2, x: 100, y: 100, vx: 5, vy: -10, active: true }];
    for (let i = 0; i < 2000 && cards[0].active; i++) Logic.stepVictory(cards);
    ok(!cards[0].active, 'victory: card settles');
    ok(cards[0].y === Logic.DESIGN_H - Logic.CARD_H, 'victory: card rests on floor');
}

// --- card image names ---
{
    ok(Logic.cardImageName(0, 14) === '1_of_hearts.svg', 'img: ace');
    ok(Logic.cardImageName(3, 11) === 'jack_of_spades.svg', 'img: jack');
    ok(Logic.cardImageName(1, 12) === 'queen_of_diamonds.svg', 'img: queen');
    ok(Logic.cardImageName(2, 13) === 'king_of_clubs.svg', 'img: king');
    ok(Logic.cardImageName(0, 10) === '10_of_hearts.svg', 'img: ten');
}

// --- solver ---
{
    // won state -> 1
    const grid = Array.from({ length: 32 }, () => []);
    const seq = (r, s) => [2 + r, 2 + r + 3, 2 + r + 6, 2 + r + 9].map(rank => card(s, rank));
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++)
            grid[r * 8 + c] = seq(r, (r + c) % 4);
    ok(Solver.solveState(grid, []) === 1, 'solver: won state -> 1');

    // deadlocked: deck empty, row4 full of cards that fit nowhere, no base cards out
    const grid2 = Array.from({ length: 32 }, () => []);
    const dead = [5, 6, 7, 8, 9, 10, 11, 12];
    for (let c = 0; c < 8; c++) grid2[24 + c] = [card(c % 4, dead[c])];
    const t0 = Date.now();
    const res = Solver.solveState(grid2, []);
    ok(res === -1, 'solver: deadlocked state -> -1 (' + (Date.now() - t0) + 'ms)');

    // one move from won -> 1
    const grid3 = Array.from({ length: 32 }, () => []);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++)
            grid3[r * 8 + c] = seq(r, (r + c) % 4);
    grid3[0] = grid3[0].slice(0, 3);          // pop the Jack off pile 0...
    grid3[24] = [card(0, 11)];                // ...it's sitting in waste
    ok(Solver.solveState(grid3, []) === 1, 'solver: one-move win -> 1');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
