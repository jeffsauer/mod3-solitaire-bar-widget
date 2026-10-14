import Quickshell
import Quickshell.Wayland
import QtQuick
import "qml"

// Quickshell entry point: Mod3 Solitaire as a fullscreen layer-shell surface.
// Install: copy this repository to ~/.config/quickshell/mod3-solitaire/
// (keeping the qml/, PNG-cards-1.3/ and sounds/ layout) and run:
//     quickshell -c mod3-solitaire
// Quickshell loads <config dir>/shell.qml, so this file must stay at the
// repository root — the game itself lives in qml/Game.qml.
ShellRoot {
    PanelWindow {
        // Unique namespace so Hyprland layerrules can match this surface.
        WlrLayershell.namespace: "mod3-solitaire"

        anchors {
            top: true
            bottom: true
            left: true
            right: true
        }
        exclusionMode: ExclusionMode.Ignore
        color: "#22703e"

        Game {
            anchors.fill: parent
        }
    }
}
