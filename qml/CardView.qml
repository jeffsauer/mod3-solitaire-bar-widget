import QtQuick
import "js/gamelogic.js" as Logic

// A single playing card (or the card back).
Item {
    id: root

    property int suit: 0      // 0=hearts, 1=diamonds, 2=clubs, 3=spades
    property int rank: 2       // 2..13 (11=J, 12=Q, 13=K)
    property bool selected: false
    property bool showBack: false
    property string backSource: "../SVG-cards/card_back.svg"
    property color selectionColor: "#ff8c00"
    // Set when the wallpaper-backed source fails to load; the card then
    // falls back to the bundled back instead of rendering blank.
    property bool backFailed: false
    property string effectiveBackSource: backFailed ? "../SVG-cards/card_back.svg" : backSource
    onBackSourceChanged: backFailed = false

    // Card back: wallpaper crop with a traditional white border.
    Item {
        anchors.fill: parent
        visible: root.showBack

        Rectangle {
            anchors.fill: parent
            color: "white"
            radius: 6
        }
        Image {
            anchors.fill: parent
            anchors.margins: 7
            source: root.effectiveBackSource
            fillMode: Image.PreserveAspectCrop
            smooth: true
            asynchronous: true
            onStatusChanged: {
                if (status === Image.Error && !root.backFailed) {
                    root.backFailed = true
                }
            }
        }
    }

    Image {
        anchors.fill: parent
        visible: !root.showBack
        source: "../SVG-cards/" + Logic.cardImageName(root.suit, root.rank)
        fillMode: Image.Stretch
        smooth: true
        asynchronous: true
    }

    Rectangle {
        anchors.fill: parent
        color: "transparent"
        radius: 6
        border.width: root.selected ? 3 : 1
        border.color: root.selected ? root.selectionColor : "black"
    }
}
