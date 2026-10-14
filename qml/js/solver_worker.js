// ---------------------------------------------------------------------------
// Mod3 Solitaire - background solver (Quickshell/Qt WorkerScript entry point)
//
// Self-contained on purpose: WorkerScript sources cannot import other .js
// files, so the bounded-DFS solver from mod3.v is duplicated here.
// (The same algorithm also exists in gamelogic.js for reference/testing.)
//
// Protocol:
//   in:  { version: int, grid: [[{suit,rank}] x 32], deck: [{suit,rank}] }
//   out: { version: int, status: string }
// ---------------------------------------------------------------------------

var COLS = 8;

function hashState(grid, deck) {
    var h = deck.length >>> 0;
    for (var i = 0; i < 32; i++) {
        h ^= (i * 0x9e3779b9) >>> 0;
        var pile = grid[i];
        for (var j = 0; j < pile.length; j++) {
            var val = ((pile[j].suit << 8) | pile[j].rank) >>> 0;
            h ^= Math.imul(val, (j + 1)) >>> 0;
            h ^= 0x85ebca6b;
            h = ((h << 13) | (h >>> 19)) >>> 0;
        }
    }
    return h >>> 0;
}

function isValidPile(pile, r) {
    if (pile.length === 0) return true;
    if (pile.length > 4) return false;
    for (var i = 0; i < pile.length; i++) {
        var expected = 2 + r + (i * 3);
        if (pile[i].rank !== expected) return false;
        if (i > 0 && pile[i].suit !== pile[i - 1].suit) return false;
    }
    return true;
}

function isValidMove(grid, card, toIdx) {
    var toR = Math.floor(toIdx / COLS);
    var dest = grid[toIdx];

    if (toR === 3) return dest.length === 0;
    if (dest.length >= 4) return false;
    if (dest.length === 0) return card.rank === (2 + toR);

    var expectedRank = 2 + toR + (dest.length * 3);
    if (card.rank !== expectedRank) return false;

    var expectedPrevRank = 2 + toR + ((dest.length - 1) * 3);
    var top = dest[dest.length - 1];
    if (top.rank !== expectedPrevRank || top.suit !== card.suit) return false;
    return true;
}

function isWon(grid, deck) {
    if (deck.length > 0) return false;
    for (var i = 24; i < 32; i++) {
        if (grid[i].length > 0) return false;
    }
    for (var i = 0; i < 24; i++) {
        if (grid[i].length !== 4) return false;
    }
    return true;
}

function cloneGrid(grid) {
    return grid.map(function (pile) {
        return pile.map(function (c) { return { suit: c.suit, rank: c.rank }; });
    });
}

// Returns 1 = winnable, -1 = deadlocked, 0 = gave up (state cap reached)
function solveState(startGrid, startDeck) {
    if (isWon(startGrid, startDeck)) return 1;

    var visited = {};
    var queue = [{ grid: startGrid, deck: startDeck.slice() }];
    var statesExplored = 0;
    var maxStates = 20000; // same bound as the V version

    while (queue.length > 0) {
        if (statesExplored > maxStates) return 0;

        var curr = queue.pop();
        statesExplored++;

        var hash = hashState(curr.grid, curr.deck);
        if (visited[hash]) continue;
        visited[hash] = true;

        if (isWon(curr.grid, curr.deck)) return 1;

        // Grid moves
        for (var fromIdx = 0; fromIdx < 32; fromIdx++) {
            if (curr.grid[fromIdx].length === 0) continue;

            // Pruning: never undo a correctly placed sequence element
            if (fromIdx < 24) {
                var fr = Math.floor(fromIdx / COLS);
                if (isValidPile(curr.grid[fromIdx], fr)) continue;
            }

            var topCard = curr.grid[fromIdx][curr.grid[fromIdx].length - 1];

            for (var toIdx = 0; toIdx < 32; toIdx++) {
                if (fromIdx === toIdx) continue;
                if (isValidMove(curr.grid, topCard, toIdx)) {
                    var nextGrid = cloneGrid(curr.grid);
                    var moved = nextGrid[fromIdx].pop();
                    nextGrid[toIdx].push(moved);
                    // replicate the auto-fill of empty row-4 slots after a move
                    var nextDeck = curr.deck.slice();
                    for (var c = 0; c < COLS; c++) {
                        var slotIdx = 24 + c;
                        if (nextGrid[slotIdx].length === 0 && nextDeck.length > 0) {
                            nextGrid[slotIdx].push(nextDeck.pop());
                        }
                    }
                    var nh = hashState(nextGrid, nextDeck);
                    if (!visited[nh]) queue.push({ grid: nextGrid, deck: nextDeck });
                }
            }
        }

        // Talon deal
        if (curr.deck.length > 0) {
            var dGrid = cloneGrid(curr.grid);
            var dDeck = curr.deck.slice();
            for (var c2 = 0; c2 < COLS; c2++) {
                if (dDeck.length > 0) {
                    dGrid[24 + c2].push(dDeck.pop());
                }
            }
            var dh = hashState(dGrid, dDeck);
            if (!visited[dh]) queue.push({ grid: dGrid, deck: dDeck });
        }
    }

    return -1; // explored everything: deadlocked
}

function statusFor(result) {
    if (result === 1) return 'Solver: This game is winnable.';
    if (result === -1) return 'Solver: This game is no longer winnable.';
    return 'Solver: Unable to determine if this game is winnable.';
}

// WorkerScript entry point (also drivable from node with a shim)
if (typeof WorkerScript !== 'undefined') {
    WorkerScript.onMessage = function (msg) {
        var result = solveState(msg.grid, msg.deck);
        WorkerScript.sendMessage({ version: msg.version, status: statusFor(result) });
    };
}

// node test hook
if (typeof module !== 'undefined') {
    module.exports = { solveState: solveState, statusFor: statusFor, isWon: isWon, isValidMove: isValidMove };
}
