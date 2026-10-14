import QtQuick
import "js/gamelogic.js" as Logic

// A single playing card (or the card back).
Item {
    id: root

    property int suit: 0      // 0=hearts, 1=diamonds, 2=clubs, 3=spades
    property int rank: 2       // 2..14 (11=J, 12=Q, 13=K, 14=A)
    property bool selected: false
    property bool showBack: false

    Image {
        anchors.fill: parent
        source: root.showBack
                ? "../PNG-cards-1.3/card_back.png"
                : "../PNG-cards-1.3/" + Logic.cardImageName(root.suit, root.rank)
        fillMode: Image.Stretch
        smooth: true
        asynchronous: true
    }

    Rectangle {
        anchors.fill: parent
        color: "transparent"
        border.width: root.selected ? 3 : 1
        border.color: root.selected ? "#ff8c00" : "black"
    }
}
