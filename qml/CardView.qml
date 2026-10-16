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
            source: root.backSource
            fillMode: Image.PreserveAspectCrop
            smooth: true
            asynchronous: true
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
