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
        id: gameWindow
        title: "Mod3 Solitaire"
        implicitWidth: 1015
        implicitHeight: 864
        minimumSize: Qt.size(640, 540)
        color: "#22703e"

        // SUPER+Q (compositor kill) closes the window but quickshell would
        // otherwise keep running — exit the process too, no Ctrl-C needed.
        onVisibleChanged: if (!visible) Qt.quit()

        Game {
            anchors.fill: parent
        }
    }
}
