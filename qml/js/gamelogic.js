.pragma library

// ---------------------------------------------------------------------------
// Mod3 Solitaire - game logic (ported from mod3.v)
//
// Pure logic, no QML/Qt dependencies: every function takes an explicit
// state object, so this file can also be unit-tested with node.
// Import in QML with:  import "js/gamelogic.js" as Logic
//
// Card: { suit: 0..3, rank: 2..14 }   (11=J, 12=Q, 13=K, 14=A)
// State: {
//   deck: [Card],            // talon, dealt via pop()
//   grid: [[Card] x 32],     // 4 rows x 8 cols, row-major
//   undoStack: [snapshot],
//   moveCount: int,
//   isWon: bool,
//   message: string,
//   selectedR: int, selectedC: int,   // -1 = none
//   lastClickTime: ms, lastClickR: int, lastClickC: int
// }
// ---------------------------------------------------------------------------

var SUIT_HEARTS = 0;
var SUIT_DIAMONDS = 1;
var SUIT_CLUBS = 2;
var SUIT_SPADES = 3;
var SUIT_NAMES = ['hearts', 'diamonds', 'clubs', 'spades'];

var COLS = 8;
var ROWS = 4;
var SLOTS = 32;
var DOUBLE_CLICK_MS = 350;

// Layout, in design pixels (the QML board is fixed at DESIGN_W x DESIGN_H
// and scaled to the window, mirroring the V version's get_scale()).
var DESIGN_W = 1015;
var DESIGN_H = 864;
var CARD_W = 80;
var CARD_H = 116;
var CARD_MARGIN = 25;
var START_X = 40;
var START_Y = 100;
var ROW_LABEL_H = 35;
var STACK_OFF_X = 0;
var STACK_OFF_Y = 14;
var BTN_H = 35;
var BOTTOM_BAR_H = 30;

function rowY(r) { return START_Y + r * (CARD_H + CARD_MARGIN + ROW_LABEL_H); }
function slotX(c) { return START_X + c * (CARD_W + CARD_MARGIN); }
function sideX() { return START_X + COLS * (CARD_W + CARD_MARGIN) + 20; }
function talonY() { return START_Y + 3 * (CARD_H + CARD_MARGIN + ROW_LABEL_H); }
function btnY(i) { return START_Y + i * 45; }  // 0=new game, 1=undo, 2=mute

function pileCardPos(r, c, i) {
    return { x: slotX(c) + i * STACK_OFF_X, y: rowY(r) + i * STACK_OFF_Y };
}

function makeCard(suit, rank) { return { suit: suit, rank: rank }; }

function cardImageName(suit, rank) {
    var s = SUIT_NAMES[suit];
    var r;
    if (rank === 14) r = '1';
    else if (rank === 11) r = 'jack';
    else if (rank === 12) r = 'queen';
    else if (rank === 13) r = 'king';
    else r = String(rank);
    return r + '_of_' + s + '.png';
}

function cardLabel(card) { return card.rank + ' of ' + SUIT_NAMES[card.suit]; }

function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
    }
}

function cloneCardArray(a) {
    return a.map(function (c) { return { suit: c.suit, rank: c.rank }; });
}

// ---------------------------------------------------------------------------
// Game setup
// ---------------------------------------------------------------------------

function newGameState() {
    var deck = [];
    var suits = [SUIT_HEARTS, SUIT_DIAMONDS, SUIT_CLUBS, SUIT_SPADES];
    for (var d = 0; d < 2; d++) {
        for (var s = 0; s < suits.length; s++) {
            for (var r = 2; r <= 14; r++) {
                deck.push(makeCard(suits[s], r));
            }
        }
    }
    shuffle(deck);

    var grid = [];
    var dealt = [];
    for (var i = 0; i < SLOTS; i++) grid.push([]);

    // Deal one card to each of the 32 slots (pop from the end, like the V version)
    for (var k = 0; k < SLOTS && deck.length > 0; k++) {
        var card = deck.pop();
        grid[k].push(card);
        dealt.push({ card: card, r: Math.floor(k / COLS), c: k % COLS });
    }

    var state = {
        deck: deck,
        grid: grid,
        undoStack: [],
        moveCount: 0,
        isWon: false,
        message: 'New Game started. Build sequences in rows 1-3!',
        selectedR: -1,
        selectedC: -1,
        lastClickTime: 0,
        lastClickR: -1,
        lastClickC: -1
    };
    return { state: state, dealt: dealt };
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

function saveUndoState(state) {
    state.undoStack.push({
        deck: cloneCardArray(state.deck),
        grid: state.grid.map(cloneCardArray),
        moveCount: state.moveCount,
        isWon: state.isWon,
        message: state.message
    });
}

function undoLastMove(state) {
    if (state.undoStack.length === 0) {
        state.message = 'Nothing to undo!';
        return false;
    }
    var s = state.undoStack.pop();
    state.deck = s.deck;
    state.grid = s.grid;
    state.moveCount = s.moveCount;
    state.isWon = s.isWon;
    state.message = 'Undo successful.';
    state.selectedR = -1;
    state.selectedC = -1;
    return true;
}

// ---------------------------------------------------------------------------
// Move rules
// ---------------------------------------------------------------------------

function isValidMove(state, card, toR, toC) {
    var dest = state.grid[toR * COLS + toC];

    // Row 4 (index 3) is waste / free slots: accepts ANY single card into an empty slot
    if (toR === 3) {
        return dest.length === 0;
    }

    // Rows 1-3 (indices 0-2) hold sequences of max 4
    if (dest.length >= 4) {
        return false;
    }

    // An empty slot only accepts the row's base card
    if (dest.length === 0) {
        return card.rank === (2 + toR);
    }

    var expectedRank = 2 + toR + (dest.length * 3);
    if (card.rank !== expectedRank) {
        return false;
    }

    var expectedPrevRank = 2 + toR + ((dest.length - 1) * 3);
    var top = dest[dest.length - 1];
    if (top.rank !== expectedPrevRank || top.suit !== card.suit) {
        return false;
    }

    return true;
}

// Auto-target: sequence rows first, then an empty row-4 slot
function findAutoTarget(state, card, srcR, srcC) {
    var tr, tc;
    for (tr = 0; tr < 3; tr++) {
        for (tc = 0; tc < COLS; tc++) {
            if (tr === srcR && tc === srcC) continue;
            if (isValidMove(state, card, tr, tc)) return [tr, tc];
        }
    }
    if (srcR < 3) {
        for (tc = 0; tc < COLS; tc++) {
            if (isValidMove(state, card, 3, tc)) return [3, tc];
        }
    }
    return [-1, -1];
}

// ---------------------------------------------------------------------------
// Moves. Each returns a list of view events:
//   { kind:'move', card, fromR, fromC, toR, toC, startX, startY, delay }
//   { kind:'fill', card, toR:3, toC, startX, startY, delay }   (talon auto-fill)
//   { kind:'win', cards: [...] }                                (victory data)
// The view turns move/fill events into card-flight animations.
// ---------------------------------------------------------------------------

function executeMove(state, fromR, fromC, toR, toC) {
    var events = [];
    var fromIdx = fromR * COLS + fromC;
    var toIdx = toR * COLS + toC;

    saveUndoState(state);

    var startPos = pileCardPos(fromR, fromC, state.grid[fromIdx].length - 1);
    var moved = state.grid[fromIdx].pop();
    state.grid[toIdx].push(moved);
    state.moveCount++;
    state.message = 'Moved card successfully.';

    events.push({
        kind: 'move', card: moved,
        fromR: fromR, fromC: fromC, toR: toR, toC: toC,
        startX: startPos.x, startY: startPos.y, delay: 0,
        toIndex: state.grid[toIdx].length - 1
    });

    fillEmptyRow4Slots(state, events);
    checkWinCondition(state, events);
    return events;
}

function fillEmptyRow4Slots(state, events) {
    var delay = 0;
    for (var c = 0; c < COLS; c++) {
        var slotIdx = 3 * COLS + c;
        if (state.grid[slotIdx].length === 0 && state.deck.length > 0) {
            var card = state.deck.pop();
            state.grid[slotIdx].push(card);
            events.push({
                kind: 'fill', card: card, toR: 3, toC: c,
                startX: sideX(), startY: talonY(), delay: delay,
                toIndex: 0
            });
            delay += 75;
            state.message += ' Auto-filled Row 4 slot from Talon.';
        }
    }
}

function checkWinCondition(state, events) {
    if (state.deck.length > 0) return false;

    var c, r, slotIdx;
    for (c = 0; c < COLS; c++) {
        if (state.grid[3 * COLS + c].length > 0) return false;
    }
    for (r = 0; r < 3; r++) {
        for (c = 0; c < COLS; c++) {
            if (state.grid[r * COLS + c].length !== 4) return false;
        }
    }

    state.isWon = true;
    state.message = 'YOU WIN! All target sequences are complete!';
    events.push({ kind: 'win', cards: beginVictory(state) });
    return true;
}

// Explode every card off the grid with a random velocity (ported from the V
// version). Clears the grid piles; the view animates `cards` with gravity.
function beginVictory(state) {
    var cards = [];
    for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
            var slotIdx = r * COLS + c;
            var pile = state.grid[slotIdx];
            for (var i = 0; i < pile.length; i++) {
                var p = pileCardPos(r, c, i);
                cards.push({
                    suit: pile[i].suit,
                    rank: pile[i].rank,
                    x: p.x, y: p.y,
                    vx: Math.random() * 16 - 8,
                    vy: Math.random() * -15 - 5,
                    active: true
                });
            }
            state.grid[slotIdx] = [];
        }
    }
    return cards;
}

// One step of the victory physics (design pixels). Mutates `cards` in place.
function stepVictory(cards) {
    var gravity = 0.6;
    var dampening = 0.85;
    for (var k = 0; k < cards.length; k++) {
        var vc = cards[k];
        if (!vc.active) continue;
        vc.vy += gravity;
        vc.x += vc.vx;
        vc.y += vc.vy;
        if (vc.y + CARD_H > DESIGN_H) {
            vc.y = DESIGN_H - CARD_H;
            vc.vy = -vc.vy * dampening;
            if (vc.vy > -1.0) { vc.vy = 0; vc.vx = 0; vc.active = false; }
        }
        if (vc.x < 0) {
            vc.x = 0;
            vc.vx = -vc.vx * dampening;
        } else if (vc.x + CARD_W > DESIGN_W) {
            vc.x = DESIGN_W - CARD_W;
            vc.vx = -vc.vx * dampening;
        }
    }
}

// ---------------------------------------------------------------------------
// Talon
// ---------------------------------------------------------------------------

// NOTE (ported behavior): like the V version, a manual talon deal places one
// card on EVERY row-4 slot, even ones that already hold a card. The automatic
// fill after moves (fillEmptyRow4Slots) only targets empty slots.
function dealFromTalon(state) {
    if (state.deck.length === 0) {
        state.message = 'Talon is empty!';
        return [];
    }
    saveUndoState(state);

    var events = [];
    var dealt = 0;
    var delay = 0;
    for (var c = 0; c < COLS; c++) {
        if (state.deck.length > 0) {
            var slotIdx = 3 * COLS + c;
            var card = state.deck.pop();
            state.grid[slotIdx].push(card);
            events.push({
                kind: 'fill', card: card, toR: 3, toC: c,
                startX: sideX(), startY: talonY(), delay: delay,
                toIndex: state.grid[slotIdx].length - 1
            });
            delay += 75;
            dealt++;
        }
    }
    state.message = 'Dealt ' + dealt + ' card(s) across Row 4 slots.';
    checkWinCondition(state, events);
    return events;
}

// ---------------------------------------------------------------------------
// Click handling (ports V's on_click grid branch + handle_grid_click,
// including the manual double-click detection)
// ---------------------------------------------------------------------------

function handleGridClick(state, r, c, nowMs) {
    var events = [];
    var slotIdx = r * COLS + c;

    var isDoubleClick = (state.lastClickR === r && state.lastClickC === c &&
        (nowMs - state.lastClickTime) < DOUBLE_CLICK_MS);
    state.lastClickTime = nowMs;
    state.lastClickR = r;
    state.lastClickC = c;

    // Double-click: auto-play the top card
    if (isDoubleClick && state.grid[slotIdx].length > 0) {
        var card = state.grid[slotIdx][state.grid[slotIdx].length - 1];
        var target = findAutoTarget(state, card, r, c);
        if (target[0] !== -1) {
            var evs = executeMove(state, r, c, target[0], target[1]);
            state.selectedR = -1;
            state.selectedC = -1;
            return evs;
        }
        state.message = 'No valid Mod3 sequence target available for this card.';
    }

    // Standard select / move
    if (state.selectedR === -1) {
        if (state.grid[slotIdx].length > 0) {
            state.selectedR = r;
            state.selectedC = c;
            var sel = state.grid[slotIdx][state.grid[slotIdx].length - 1];
            state.message = 'Selected: ' + cardLabel(sel);
        }
        return events;
    }

    if (state.selectedR === r && state.selectedC === c) {
        state.selectedR = -1;
        state.selectedC = -1;
        state.message = 'Selection cleared.';
        return events;
    }

    var fromR = state.selectedR;
    var fromC = state.selectedC;
    var fromIdx = fromR * COLS + fromC;
    if (state.grid[fromIdx].length > 0) {
        var moving = state.grid[fromIdx][state.grid[fromIdx].length - 1];
        if (isValidMove(state, moving, r, c)) {
            events = executeMove(state, fromR, fromC, r, c);
        } else {
            state.message = 'Invalid move according to Mod3-style sequence rules!';
        }
    }
    state.selectedR = -1;
    state.selectedC = -1;
    return events;
}

// ---------------------------------------------------------------------------
// Solver serialization (for the WorkerScript)
// ---------------------------------------------------------------------------

function serializeForSolver(state) {
    return {
        grid: state.grid.map(cloneCardArray),
        deck: cloneCardArray(state.deck)
    };
}
