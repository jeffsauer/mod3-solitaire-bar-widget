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

    // Omarchy's live theme palette. If the file is missing (non-Omarchy
    // box), the game's built-in palette is used.
    property var gameTheme: Theme.defaultTheme()
    property string lastThemeText: ""

    FileView {
        id: themeFile
        path: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"
        watchChanges: true
        onLoaded: {
            var t = themeFile.text();
            if (t !== shellRoot.lastThemeText) {
                shellRoot.lastThemeText = t;
                shellRoot.gameTheme = Theme.loadTheme(t);
            }
        }
        onFileChanged: themeFile.reload()
    }

    // Omarchy stages a theme switch in next-theme/ and then swaps the
    // current/ directory, so the watched inode can change without a file
    // event. Poll as a backup: a theme switch re-skins within ~3 seconds.
    Timer {
        interval: 3000
        running: true
        repeat: true
        onTriggered: themeFile.reload()
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
