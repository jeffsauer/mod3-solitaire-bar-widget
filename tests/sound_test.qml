// Standalone sound diagnostic: run with
//     qmlscene tests/sound_test.qml
// from the repo root. Click the window — you should hear the card flip.
// If this is silent too, the problem is the system QtMultimedia audio
// backend, not the game code.
import QtQuick
import QtMultimedia

Item {
    width: 300
    height: 120

    SoundEffect {
        id: s
        source: "../sounds/card_flip.wav"
        onStatusChanged: console.log("test sound status:", status)
    }

    Rectangle {
        anchors.fill: parent
        color: "#22703e"
    }

    Text {
        anchors.centerIn: parent
        text: "click for flip sound"
        color: "white"
        font.pixelSize: 16
    }

    MouseArea {
        anchors.fill: parent
        onClicked: s.play()
    }
}
