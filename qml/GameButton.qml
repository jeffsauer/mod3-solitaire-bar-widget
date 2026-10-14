import QtQuick

Item {
    id: root

    property string label: ""
    property color bgColor: "gray"

    signal clicked()

    width: 80
    height: 35

    Rectangle {
        anchors.fill: parent
        color: root.bgColor
        border.color: "white"
        border.width: 1
    }

    Text {
        anchors.centerIn: parent
        text: root.label
        color: "white"
        font.bold: true
        font.pixelSize: 10
    }

    MouseArea {
        anchors.fill: parent
        onClicked: root.clicked()
    }
}
