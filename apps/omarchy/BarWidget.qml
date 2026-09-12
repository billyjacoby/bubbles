import QtQuick
import Quickshell
import qs.Ui

BarWidget {
  id: root
  moduleName: "billyjacoby.bubbles"

  property var bubblesService: null

  function bindService() {
    if (bubblesService) return
    var host = bar && bar.shell ? bar.shell : null
    if (!host || typeof host.serviceFor !== "function") return
    bubblesService = host.serviceFor("billyjacoby.bubbles")
  }

  readonly property bool connected:
    bubblesService ? bubblesService.connected === true : false
  readonly property string pluginDirectory:
    Qt.resolvedUrl(".").toString().replace(/^file:\/\//, "")

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: bindService()

  Timer {
    interval: 250
    running: root.bubblesService === null
    repeat: true
    onTriggered: root.bindService()
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf075"
    tooltipText: root.connected ? "Bubbles · messages live" : "Bubbles · reconnecting"

    onPressed: function(mouseButton) {
      if (mouseButton === Qt.RightButton) {
        if (root.bubblesService) root.bubblesService.restart()
      } else {
        Quickshell.execDetached([root.pluginDirectory + "bin/open"])
      }
    }
  }
}
