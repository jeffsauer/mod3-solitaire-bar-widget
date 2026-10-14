import Quickshell
import QtQml
import QtQuick
import "qml"

// Quickshell entry point: Mod3 Solitaire as a regular desktop window.
// Install: copy this repository to ~/.config/quickshell/mod3-solitaire/
// (keeping the qml/, PNG-cards-1.3/ and sounds/ layout) and run:
//     quickshell -c mod3-solitaire
// Quickshell loads <config dir>/shell.qml, so this file must stay at the
// repository root — the game itself lives in qml/Game.qml.
ShellRoot {
    FloatingWindow {
        title: "Mod3 Solitaire"
        width: 1015
        height: 864
        minimumSize: Qt.size(640, 540)
        color: "#22703e"

        Game {
            anchors.fill: parent
        }
    }
}
