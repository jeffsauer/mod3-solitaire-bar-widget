import QtQuick

// Overlay card that flies from (sx,sy) to (ex,ey) after delayMs.
// Mirrors the V version's Animation struct (400ms linear-ish flight,
// flip sound triggered when motion starts).
Item {
    id: root

    property int cardSuit: 0
    property int cardRank: 2
    property real sx: 0
    property real sy: 0
    property real ex: 0
    property real ey: 0
    property real delayMs: 0
    property real t: 0

    signal started()
    signal finished()

    x: sx + (ex - sx) * t
    y: sy + (ey - sy) * t

    CardView {
        anchors.fill: parent
        suit: root.cardSuit
        rank: root.cardRank
    }

    // NOTE: the animation must NOT auto-start. Game.qml connects the
    // started/finished signals first, then calls start(). With delayMs = 0
    // an auto-running animation would emit `started` before the handler
    // is connected and the flip sound would never play.
    SequentialAnimation {
        id: flyAnim
        PauseAnimation { duration: root.delayMs }
        ScriptAction { script: root.started() }
        NumberAnimation {
            target: root
            property: "t"
            from: 0
            to: 1
            duration: 400
            easing.type: Easing.InOutQuad
        }
        ScriptAction { script: root.finished() }
    }

    function start() {
        flyAnim.start();
    }
}
