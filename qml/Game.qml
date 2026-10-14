import QtQml
import QtQuick
import QtMultimedia
import "js/gamelogic.js" as Logic

// Mod3 Solitaire - pure QtQuick game UI (ported from the V/gg version).
//
// The board is laid out once in fixed design coordinates (1015x864, the same
// numbers as mod3.v) and uniformly scaled to the window, so all layout math
// in gamelogic.js ports 1:1. Game state lives in a plain JS object
// (`gameState`); after every mutation `stateVersion` is bumped so QML
// bindings re-evaluate.
//
// Run standalone under qmlscene, or fullscreen under Quickshell via shell.qml.
Item {
    id: root

    property var gameState: null
    property int stateVersion: 0
    property string solverStatus: "Solver: Unknown"
    property int solverVersion: 0
    property bool muted: false

    // "r,c" -> number of card flights currently targeting that pile's top.
    // The grid hides a pile's top card while its flight is in flight.
    property var hiddenTops: ({})

    // Imperatively managed (never read in bindings):
    property var flightItems: []
    property var victoryItems: []
    property var victoryData: []

    SoundEffect {
        id: flipSound
        source: "../sounds/card_flip.wav"
        // Temporary diagnostic: reports load status to the quickshell log
        onStatusChanged: console.log("flipSound status:", status,
                                     status === SoundEffect.Ready ? "(ready)" :
                                     status === SoundEffect.Error ? "(ERROR)" : "")
    }

    WorkerScript {
        id: solverWorker
        source: "js/solver_worker.js"
        onMessage: function (messageObject) {
            if (messageObject.version === root.solverVersion) {
                root.solverStatus = messageObject.status;
            }
        }
    }

    Timer {
        id: physicsTimer
        interval: 16
        repeat: true
        running: false
        onTriggered: root.stepVictoryPhysics()
    }

    Component {
        id: flyCardComponent
        FlyingCard {}
    }

    Component {
        id: victoryCardComponent
        CardView {}
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------

    function clearFlights() {
        for (var i = 0; i < flightItems.length; i++) {
            flightItems[i].destroy();
        }
        flightItems = [];
        hiddenTops = {};
    }

    // Publish a state mutation to the view. The game logic mutates the
    // grid/deck arrays in place, but QML bindings compare `var` properties
    // by reference — returning the same array object would NOT notify and
    // the piles would never re-render. Fresh copies force the update.
    function refreshState() {
        if (gameState) {
            gameState.grid = gameState.grid.map(function (p) { return p.slice(); });
            gameState.deck = gameState.deck.slice();
        }
        root.stateVersion++;
    }

    function clearVictory() {
        for (var i = 0; i < victoryItems.length; i++) {
            victoryItems[i].destroy();
        }
        victoryItems = [];
        victoryData = [];
        physicsTimer.running = false;
    }

    function flyCard(card, sx, sy, toR, toC, toIndex, delayMs) {
        var key = toR + "," + toC;
        hiddenTops[key] = (hiddenTops[key] || 0) + 1;
        var endPos = Logic.pileCardPos(toR, toC, toIndex);
        var obj = flyCardComponent.createObject(board, {
            cardSuit: card.suit,
            cardRank: card.rank,
            sx: sx, sy: sy,
            ex: endPos.x, ey: endPos.y,
            delayMs: delayMs,
            width: Logic.CARD_W,
            height: Logic.CARD_H
        });
        if (!obj) {
            console.warn("FlyingCard creation failed");
            hiddenTops[key] = Math.max(0, hiddenTops[key] - 1);
            return;
        }
        obj.started.connect(function () {
            if (!root.muted) flipSound.play();
        });
        obj.finished.connect(function () {
            hiddenTops[key] = Math.max(0, (hiddenTops[key] || 1) - 1);
            var idx = flightItems.indexOf(obj);
            if (idx >= 0) flightItems.splice(idx, 1);
            obj.destroy();
            root.stateVersion++;
        });
        flightItems.push(obj);
        root.stateVersion++;
    }

    function runEvents(events) {
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev.kind === "move" || ev.kind === "fill") {
                flyCard(ev.card, ev.startX, ev.startY, ev.toR, ev.toC, ev.toIndex, ev.delay);
            } else if (ev.kind === "win") {
                beginVictory(ev.cards);
            }
        }
    }

    function newGame() {
        clearFlights();
        clearVictory();
        var res = Logic.newGameState();
        gameState = res.state;
        for (var i = 0; i < res.dealt.length; i++) {
            var d = res.dealt[i];
            flyCard(d.card, Logic.sideX(), Logic.talonY(), d.r, d.c, 0, i * 45);
        }
        root.stateVersion++;
        updateSolver();
    }

    function gridClicked(r, c) {
        if (!gameState || gameState.isWon) return;
        var evs = Logic.handleGridClick(gameState, r, c, Date.now());
        runEvents(evs);
        refreshState();
        if (evs.length > 0) updateSolver();
    }

    function talonClicked() {
        if (!gameState || gameState.isWon) return;
        var evs = Logic.dealFromTalon(gameState);
        runEvents(evs);
        refreshState();
        if (evs.length > 0) updateSolver();
    }

    function undoClicked() {
        if (!gameState) return;
        if (Logic.undoLastMove(gameState)) {
            clearFlights();
            clearVictory();
            if (!muted) flipSound.play();
            refreshState();
            updateSolver();
        } else {
            refreshState();
        }
    }

    function muteClicked() {
        muted = !muted;
        if (gameState) {
            gameState.message = muted ? "Audio muted." : "Audio unmuted.";
        }
        root.stateVersion++;
    }

    function updateSolver() {
        if (!gameState) return;
        if (gameState.isWon) {
            solverStatus = "Solver: This game is winnable.";
            return;
        }
        solverVersion++;
        solverStatus = "Solver: Calculating...";
        var s = Logic.serializeForSolver(gameState);
        solverWorker.sendMessage({ version: solverVersion, grid: s.grid, deck: s.deck });
    }

    function beginVictory(cards) {
        clearVictory();
        victoryData = cards;
        for (var i = 0; i < cards.length; i++) {
            var obj = victoryCardComponent.createObject(board, {
                suit: cards[i].suit,
                rank: cards[i].rank,
                width: Logic.CARD_W,
                height: Logic.CARD_H,
                x: cards[i].x,
                y: cards[i].y
            });
            victoryItems.push(obj);
        }
        physicsTimer.running = true;
    }

    function stepVictoryPhysics() {
        if (victoryData.length === 0 || victoryItems.length === 0) {
            physicsTimer.running = false;
            return;
        }
        Logic.stepVictory(victoryData);
        var anyActive = false;
        for (var i = 0; i < victoryItems.length; i++) {
            victoryItems[i].x = victoryData[i].x;
            victoryItems[i].y = victoryData[i].y;
            if (victoryData[i].active) anyActive = true;
        }
        if (!anyActive) physicsTimer.running = false;
    }

    Component.onCompleted: newGame()

    // ------------------------------------------------------------------
    // Board (fixed design size, uniformly scaled to the window)
    // ------------------------------------------------------------------

    Item {
        id: board
        width: Logic.DESIGN_W
        height: Logic.DESIGN_H
        scale: (root.width > 0 && root.height > 0)
               ? Math.min(root.width / width, root.height / height) : 1
        transformOrigin: Item.TopLeft
        x: (root.width - width * scale) / 2
        y: (root.height - height * scale) / 2

        // Felt
        Rectangle {
            anchors.fill: parent
            color: "#22703e"
        }

        // Header
        Text {
            x: Logic.START_X
            y: 14
            text: "MOD3 SOLITAIRE"
            color: "white"
            font.bold: true
            font.pixelSize: 22
        }
        Text {
            x: Logic.START_X
            y: 42
            text: { root.stateVersion; return root.gameState ? root.gameState.message : ""; }
            color: { root.stateVersion; return (root.gameState && root.gameState.isWon) ? "#64ff64" : "yellow"; }
            font.bold: { root.stateVersion; return !!(root.gameState && root.gameState.isWon); }
            font.pixelSize: 13
        }

        // Row target labels
        Repeater {
            model: ["Row 1 Target: 2 - 5 - 8 - J",
                    "Row 2 Target: 3 - 6 - 9 - Q",
                    "Row 3 Target: 4 - 7 - 10 - K"]
            delegate: Text {
                x: Logic.START_X
                y: Logic.rowY(index) - 15
                text: modelData
                color: "#d2f0d2"
                font.bold: true
                font.pixelSize: 11
            }
        }

        // 4x8 grid of piles
        Repeater {
            model: 32
            delegate: Item {
                property int pr: Math.floor(index / 8)
                property int pc: index % 8
                property string pileKey: pr + "," + pc
                property var pileCards: {
                    root.stateVersion;
                    return root.gameState ? root.gameState.grid[index] : [];
                }

                x: Logic.slotX(pc)
                y: Logic.rowY(pr)
                width: Logic.CARD_W
                height: Logic.CARD_H

                // Slot outline
                Rectangle {
                    width: Logic.CARD_W
                    height: Logic.CARD_H
                    color: "transparent"
                    border.color: "#46ffffff"
                    border.width: 1
                }

                // Cards in the pile
                Repeater {
                    model: pileCards.length
                    delegate: CardView {
                        x: index * Logic.STACK_OFF_X
                        y: index * Logic.STACK_OFF_Y
                        width: Logic.CARD_W
                        height: Logic.CARD_H
                        suit: pileCards[index] ? pileCards[index].suit : 0
                        rank: pileCards[index] ? pileCards[index].rank : 2
                        selected: {
                            root.stateVersion;
                            return index === pileCards.length - 1
                                && root.gameState
                                && root.gameState.selectedR === pr
                                && root.gameState.selectedC === pc;
                        }
                        visible: {
                            root.stateVersion;
                            return !(index === pileCards.length - 1
                                     && (root.hiddenTops[pileKey] || 0) > 0);
                        }
                    }
                }

                // Click area covering the whole stack
                MouseArea {
                    width: Logic.CARD_W
                    height: {
                        root.stateVersion;
                        return Logic.CARD_H + Math.max(0, pileCards.length - 1) * Logic.STACK_OFF_Y;
                    }
                    onClicked: root.gridClicked(pr, pc)
                }
            }
        }

        // Side buttons
        GameButton {
            x: Logic.sideX()
            y: Logic.btnY(0)
            label: "NEW GAME"
            bgColor: "#be3232"
            onClicked: root.newGame()
        }
        GameButton {
            x: Logic.sideX()
            y: Logic.btnY(1)
            label: "UNDO"
            bgColor: {
                root.stateVersion;
                return (root.gameState && root.gameState.undoStack.length > 0) ? "#3c8cc8" : "#464646";
            }
            onClicked: root.undoClicked()
        }
        GameButton {
            x: Logic.sideX()
            y: Logic.btnY(2)
            label: root.muted ? "UNMUTE" : "MUTE"
            bgColor: root.muted ? "#963c3c" : "#3c785a"
            onClicked: root.muteClicked()
        }

        // Talon
        Item {
            x: Logic.sideX()
            y: Logic.talonY()
            width: Logic.CARD_W
            height: Logic.CARD_H

            Rectangle {
                anchors.fill: parent
                color: "transparent"
                border.color: "#46ffffff"
                border.width: 1
                visible: {
                    root.stateVersion;
                    return !root.gameState || root.gameState.deck.length === 0;
                }
            }
            CardView {
                anchors.fill: parent
                showBack: true
                visible: {
                    root.stateVersion;
                    return !!(root.gameState && root.gameState.deck.length > 0);
                }
            }
            MouseArea {
                anchors.fill: parent
                onClicked: root.talonClicked()
            }
        }

        // Victory banner
        Rectangle {
            visible: { root.stateVersion; return !!(root.gameState && root.gameState.isWon); }
            x: (Logic.DESIGN_W - 400) / 2
            y: (Logic.DESIGN_H - 100) / 2
            width: 400
            height: 100
            color: "#d2000000"
            border.color: "#ffd700"
            border.width: 2

            Text {
                x: 40
                y: 20
                text: "CONGRATULATIONS! YOU WON!"
                color: "yellow"
                font.bold: true
                font.pixelSize: 18
            }
            Text {
                x: 90
                y: 55
                text: {
                    root.stateVersion;
                    return "Completed in " + (root.gameState ? root.gameState.moveCount : 0) + " moves.";
                }
                color: "white"
                font.pixelSize: 13
            }
        }

        // Bottom bar
        Rectangle {
            x: 0
            y: Logic.DESIGN_H - Logic.BOTTOM_BAR_H
            width: Logic.DESIGN_W
            height: Logic.BOTTOM_BAR_H
            color: "#144626"
            border.color: "#32ffffff"
            border.width: 1

            Text {
                x: Logic.START_X
                y: 7
                text: root.solverStatus
                color: "#c8c8c8"
                font.bold: true
                font.pixelSize: 12
            }
            Text {
                x: Logic.DESIGN_W - 120
                y: 7
                text: {
                    root.stateVersion;
                    return "MOVES: " + (root.gameState ? root.gameState.moveCount : 0);
                }
                color: "white"
                font.bold: true
                font.pixelSize: 12
            }
        }
    }
}
