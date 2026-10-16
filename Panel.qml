import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "qml"
import "qml/js/theme.js" as Theme

// Game panel for the Mod3 Solitaire bar widget.
// Anchored to the bar button; hosts the full game at its 1015x864
// design size. Escape closes it via PanelKeyCatcher.
Panel {
    id: root

    moduleName: "io.github.jeffsauer.mod3-solitaire"
    manageIpc: false

    property var anchorItem: null
    property var hostWidget: null

    function open() {
        root.controller.show()
    }

    function close() {
        root.controller.hide()
    }

    function toggle() {
        if (root.opened) root.close()
        else root.open()
    }

    function switchPanel(direction) {
        if (root.bar && typeof root.bar.switchPanelFrom === "function")
            return root.bar.switchPanelFrom(root.hostWidget || root, direction)
        return false
    }

    // Omarchy's live theme palette. If the file is
    // missing, the game's built-in palette is used.
    property var gameTheme: Theme.defaultTheme()
    property string lastThemeText: ""

    // Card back source: a crop of the current desktop wallpaper with a
    // traditional white border (refreshed on theme/background change),
    // falling back to the bundled back if none is available.
    property string wallpaperPath: ""
    property string cardBackSource: {
        if (/\.(png|jpe?g|webp|bmp|tiff?|svg)$/i.test(wallpaperPath))
            return "file://" + wallpaperPath
        return Qt.resolvedUrl("PNG-cards-1.3/card_back.png")
    }

    function refreshWallpaper() { bgProc.running = true }

    Process {
        id: bgProc
        command: ["readlink", "-f",
                  Quickshell.env("HOME") + "/.local/state/omarchy/current/background"]
        stdout: StdioCollector {
            onStreamFinished: {
                var p = text.trim()
                if (p !== root.wallpaperPath)
                    root.wallpaperPath = p
            }
        }
    }

    FileView {
        id: themeFile
        path: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"
        watchChanges: true
        onLoaded: {
            var t = themeFile.text();
            if (t !== root.lastThemeText) {
                root.lastThemeText = t;
                root.gameTheme = Theme.loadTheme(t);
                root.refreshWallpaper();
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
        onTriggered: {
            themeFile.reload()
            root.refreshWallpaper()
        }
    }

    KeyboardPanel {
        id: panel
        anchorItem: root.anchorItem
        owner: root.hostWidget || root
        bar: root.bar
        open: root.opened
        focusTarget: keyCatcher
        // The game is laid out for exactly 1015x864 (buttons reach x=980),
        // so the panel's default 14px padding would clip its right edge.
        padding: 0
        contentWidth: 1015
        contentHeight: 864

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            onCloseRequested: root.close()
            onTabRequested: function (direction) { root.switchPanel(direction) }

            Game {
                anchors.fill: parent
                theme: root.gameTheme
                cardBackSource: root.cardBackSource
            }
        }
    }
}
