// ---------------------------------------------------------------------------
// Mod3 Solitaire - background solver (Quickshell/Qt WorkerScript entry point)
//
// Self-contained on purpose: WorkerScript sources cannot import other .js
// files, so everything the solver needs lives in this file.
//
// Algorithm: A* best-first search over canonical state keys.
//   - A state is encoded as one string: the four rows' piles joined by
//     separators, plus the remaining deck length. Piles in rows 1-3 are
//     SORTED (columns there are interchangeable - every rule that touches
//     them is content-based), while Row 4 piles stay in true column order
//     because the talon deals specific cards to specific columns. The
//     remaining deck is fully described by its length: cards only ever pop
//     off the end, so it is always a prefix of the deck we were handed.
//   - State identity is the exact key string (no hash-only shortcuts, so
//     verdicts are never corrupted by hash collisions).
//   - Cost model matches the game's MOVES counter: moving a card costs 1,
//     a talon deal costs 0. Auto-fills after a move are part of that move.
//   - Heuristic: the number of cards not yet part of a correct sequence
//     prefix in rows 1-3 (deck and Row 4 cards all count). Every such card
//     must move at least once more, so the estimate never overshoots and
//     the first time A* reaches a won state its move count is the minimum.
//   - Pruning: cards are never moved off a pile that is already a correct
//     sequence prefix in rows 1-3 (those cards are in final positions),
//     and duplicate twin piles/destinations are only expanded once.
//   - Budgets keep the worker honest: past MAX_GENERATED states or
//     MAX_MS milliseconds the answer is "unable to determine".
//
// Protocol:
//   in:  { version: int, grid: [[{suit,rank}] x 32], deck: [{suit,rank}] }
//   out: { version: int, status: string, moves: int (-1 unless winnable) }
// ---------------------------------------------------------------------------

var COLS = 8;
var MAX_GENERATED = 300000;
var MAX_MS = 5000;

// Key separators, chosen above the card-char range (chars 1..48) so no
// card can ever collide with them: the 9 of spades is char 44 (','),
// which rules out the printable punctuation separators.
var SEP_PILE = String.fromCharCode(49);
var SEP_ROW = String.fromCharCode(50);

// The deck length is encoded as ONE trailing char (52 + deckLen), never
// as decimal digits: an earlier version appended it as a decimal string
// after a char-51 separator, which is the character '3' itself - so any
// deck length containing the digit 3 (3, 13, 23, 30-39, ...) was split
// apart and decoded as NaN or a wrong, smaller count, making the solver
// search positions as if most of the talon did not exist.

// Card <-> char: code 0..47 = suit*12 + (rank-2); stored char is code+1 so
// pile strings never contain the separator characters used in state keys.
function cardChar(card) { return String.fromCharCode(card.suit * 12 + (card.rank - 2) + 1); }
function rankOf(ch) { return (ch.charCodeAt(0) - 1) % 12 + 2; }
function suitOf(ch) { return Math.floor((ch.charCodeAt(0) - 1) / 12); }

// Is this pile (string, bottom..top) a correct sequence prefix for row r?
function pileIsValidPrefix(s, r) {
    for (var i = 0; i < s.length; i++) {
        if (rankOf(s.charAt(i)) !== 2 + r + i * 3) return false;
        if (i > 0 && suitOf(s.charAt(i)) !== suitOf(s.charAt(0))) return false;
    }
    return true;
}

// Number of cards not yet part of a correct sequence prefix (the heuristic).
// totalCards is 96 for a full game; positions serialized from a live game
// always hold every card between grid and deck.
function unplacedCount(rows, deckLen, totalCards) {
    var placed = 0;
    for (var r = 0; r < 3; r++) {
        for (var p = 0; p < COLS; p++) {
            var pile = rows[r][p];
            for (var i = 0; i < pile.length; i++) {
                if (rankOf(pile.charAt(i)) === 2 + r + i * 3 &&
                    (i === 0 || suitOf(pile.charAt(i)) === suitOf(pile.charAt(0)))) {
                    placed++;
                } else {
                    break;
                }
            }
        }
    }
    return totalCards - placed;
}

// grid (array of 32 piles of {suit,rank}) -> rows of pile strings.
// Rows 1-3 sorted (canonical), Row 4 in column order.
function encodeGrid(grid) {
    var rows = [];
    for (var r = 0; r < 4; r++) {
        var piles = [];
        for (var c = 0; c < COLS; c++) {
            var pile = grid[r * COLS + c];
            var s = '';
            for (var i = 0; i < pile.length; i++) s += cardChar(pile[i]);
            piles.push(s);
        }
        if (r < 3) piles.sort();
        rows.push(piles);
    }
    return rows;
}

function keyOf(rows, deckLen) {
    return rows[0].join(SEP_PILE) + SEP_ROW + rows[1].join(SEP_PILE) + SEP_ROW +
           rows[2].join(SEP_PILE) + SEP_ROW + rows[3].join(SEP_PILE) +
           String.fromCharCode(52 + deckLen);
}

function decodeKey(key) {
    var deckLen = key.charCodeAt(key.length - 1) - 52;
    var rowParts = key.slice(0, key.length - 1).split(SEP_ROW);
    var rows = [];
    for (var r = 0; r < 4; r++) rows.push(rowParts[r].split(SEP_PILE));
    return { rows: rows, deckLen: deckLen };
}

function isWonRows(rows, deckLen) {
    if (deckLen > 0) return false;
    for (var c = 0; c < COLS; c++) if (rows[3][c].length > 0) return false;
    for (var r = 0; r < 3; r++) {
        for (var c2 = 0; c2 < COLS; c2++) {
            var pile = rows[r][c2];
            if (pile.length !== 4 || !pileIsValidPrefix(pile, r)) return false;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// Search. Returns { result: 1 winnable | -1 deadlocked | 0 unknown,
//                   moves: minimum card moves to win (only when result = 1),
//                   states: states generated }
// ---------------------------------------------------------------------------
function solveState(startGrid, startDeck) {
    var totalCards = startDeck.length;
    for (var i = 0; i < 32; i++) totalCards += startGrid[i].length;

    // Deck cards in pop order reference: the remaining deck is always the
    // first deckLen entries of startDeck; pops take deckCards[deckLen-1].
    var deckCards = startDeck.map(cardChar);

    var startRows = encodeGrid(startGrid);
    if (isWonRows(startRows, startDeck.length)) {
        return { result: 1, moves: 0, states: 0 };
    }

    var best = {};           // state key -> cheapest g seen
    var buckets = [];        // buckets[f] = array of [key, g], LIFO
    var generated = 0;
    var t0 = Date.now();

    function relax(rows, deckLen, g) {
        var key = keyOf(rows, deckLen);
        var known = best[key];
        if (known !== undefined && known <= g) return;
        best[key] = g;
        generated++;
        var f = g + unplacedCount(rows, deckLen, totalCards);
        while (buckets.length <= f) buckets.push(null);
        if (!buckets[f]) buckets[f] = [];
        buckets[f].push([key, g]);
    }

    relax(startRows, startDeck.length, 0);

    var currentF = 0;
    var pops = 0;
    while (true) {
        // Advance to the next non-empty bucket (f never decreases along
        // an edge: deals keep f, moves raise it by at most their cost).
        while (currentF < buckets.length && (!buckets[currentF] || buckets[currentF].length === 0)) {
            currentF++;
        }
        if (currentF >= buckets.length) {
            return { result: -1, moves: -1, states: generated }; // space exhausted
        }
        var bucket = buckets[currentF];
        var entry = bucket.pop();
        var key = entry[0];
        var g = entry[1];
        if (best[key] !== undefined && best[key] < g) continue; // stale entry

        pops++;
        if (generated > MAX_GENERATED || ((pops & 1023) === 0 && Date.now() - t0 > MAX_MS)) {
            return { result: 0, moves: -1, states: generated }; // over budget
        }

        var decoded = decodeKey(key);
        var rows = decoded.rows;
        var deckLen = decoded.deckLen;

        if (isWonRows(rows, deckLen)) {
            return { result: 1, moves: g, states: generated };
        }

        expand(rows, deckLen, g);
    }

    function expand(rows, deckLen, g) {
        var r, p, q, rr;
        for (r = 0; r < 4; r++) {
            var seenSrc = {};
            for (p = 0; p < COLS; p++) {
                var pile = rows[r][p];
                if (pile.length === 0) continue;
                if (seenSrc[pile]) continue; // identical twin pile: same successors
                seenSrc[pile] = true;
                if (r < 3 && pileIsValidPrefix(pile, r)) continue; // never unbuild

                var card = pile.charAt(pile.length - 1);
                var crank = rankOf(card);
                var csuit = suitOf(card);

                // Sequence destinations in rows 1-3: the card's rank fixes
                // exactly which (row, dest pile length) class can take it.
                for (rr = 0; rr < 3; rr++) {
                    var rem = crank - 2 - rr;
                    if (rem < 0 || rem % 3 !== 0) continue;
                    var needLen = rem / 3;
                    if (needLen > 3) continue;
                    var seenDst = {};
                    for (q = 0; q < COLS; q++) {
                        if (rr === r && q === p) continue;
                        var dst = rows[rr][q];
                        if (dst.length !== needLen) continue;
                        if (needLen > 0) {
                            var top = dst.charAt(dst.length - 1);
                            if (suitOf(top) !== csuit) continue;
                            if (rankOf(top) !== 2 + rr + (needLen - 1) * 3) continue;
                        }
                        if (seenDst[dst]) continue;
                        seenDst[dst] = true;
                        var nrows = [rows[0].slice(), rows[1].slice(), rows[2].slice(), rows[3].slice()];
                        nrows[r][p] = pile.slice(0, pile.length - 1);
                        nrows[rr][q] = dst + card;
                        if (r < 3) nrows[r].sort();
                        if (rr < 3 && rr !== r) nrows[rr].sort();
                        var ndl = deckLen;
                        for (var c = 0; c < COLS && ndl > 0; c++) {
                            if (nrows[3][c].length === 0) nrows[3][c] = deckCards[--ndl];
                        }
                        relax(nrows, ndl, g + 1);
                    }
                }

                // Row 4 destinations: every empty slot is a distinct
                // concrete choice (future deals pair cards by column).
                for (q = 0; q < COLS; q++) {
                    if (rows[3][q].length !== 0) continue;
                    if (r === 3 && q === p) continue;
                    var nrows2 = [rows[0].slice(), rows[1].slice(), rows[2].slice(), rows[3].slice()];
                    nrows2[r][p] = pile.slice(0, pile.length - 1);
                    if (r < 3) nrows2[r].sort();
                    nrows2[3][q] = card;
                    var ndl2 = deckLen;
                    for (var c2 = 0; c2 < COLS && ndl2 > 0; c2++) {
                        if (nrows2[3][c2].length === 0) nrows2[3][c2] = deckCards[--ndl2];
                    }
                    relax(nrows2, ndl2, g + 1);
                }
            }
        }

        // Talon deal (cost 0, like the game's move counter): one card onto
        // every Row 4 pile, in column order.
        if (deckLen > 0) {
            var drows = [rows[0].slice(), rows[1].slice(), rows[2].slice(), rows[3].slice()];
            var ddl = deckLen;
            for (var c3 = 0; c3 < COLS && ddl > 0; c3++) {
                drows[3][c3] += deckCards[--ddl];
            }
            relax(drows, ddl, g);
        }
    }
}

function statusFor(result, moves) {
    if (result === 1) {
        if (moves === 0) return 'Solver: This game is winnable.';
        return 'Solver: This game is winnable in ' + moves + (moves === 1 ? ' move.' : ' moves.');
    }
    if (result === -1) return 'Solver: This game is no longer winnable.';
    return 'Solver: Unable to determine if this game is winnable.';
}

// WorkerScript entry point (also drivable from node with a shim)
if (typeof WorkerScript !== 'undefined') {
    WorkerScript.onMessage = function (msg) {
        var solved = solveState(msg.grid, msg.deck);
        WorkerScript.sendMessage({
            version: msg.version,
            status: statusFor(solved.result, solved.moves),
            moves: solved.result === 1 ? solved.moves : -1
        });
    };
}

// node test hook
if (typeof module !== 'undefined') {
    module.exports = { solveState: solveState, statusFor: statusFor };
}
