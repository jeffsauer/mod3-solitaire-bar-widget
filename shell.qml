import Quickshell
import Quickshell.Io
import QtQml
import QtQuick
import "qml"
import "qml/js/theme.js" as Theme

// Quickshell entry point: Mod3 Solitaire as a regular desktop window.
// Install: copy this repository to ~/.config/quickshell/mod3-solitaire/
// (keeping the qml/, PNG-cards-1.3/ and sounds/ layout) and run:
//     quickshell -c mod3-solitaire
// Quickshell loads <config dir>/shell.qml, so this file must stay at the
// repository root — the game itself lives in qml/Game.qml.
ShellRoot {
    id: shellRoot

    // Omarchy's live theme palette. FileView watches the file, so switching
    // the desktop theme re-skins the game without a restart. If the file is
    // missing (non-Omarchy box), the game's built-in palette is used.
    property var gameTheme: Theme.defaultTheme()

    FileView {
        id: themeFile
        path: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"
        watchChanges: true
        onLoaded: shellRoot.gameTheme = Theme.loadTheme(themeFile.text())
        onFileChanged: themeFile.reload()
    }

    FloatingWindow {
        id: gameWindow
        title: "Mod3 Solitaire"
        implicitWidth: 1015
        implicitHeight: 864
        minimumSize: Qt.size(640, 540)
        color: shellRoot.gameTheme.felt

        // SUPER+Q (compositor kill) closes the window but quickshell would
        // otherwise keep running — exit the process too, no Ctrl-C needed.
        onVisibleChanged: if (!visible) Qt.quit()

        Game {
            anchors.fill: parent
            theme: shellRoot.gameTheme
        }
    }
}
