import QtQuick
import Quickshell.Io

Item {
  id: root
  width: 0
  height: 0
  visible: false

  property var shell: null
  property var manifest: null
  property var pluginRegistry: null
  property var barWidgetRegistry: null
  property string omarchyPath: ""

  property bool connected: false
  readonly property bool running: listener.running
  readonly property string pluginDirectory:
    Qt.resolvedUrl(".").toString().replace(/^file:\/\//, "")
  readonly property string listenCommand: pluginDirectory + "bin/listen"

  function start() {
    if (!listener.running) listener.running = true
  }

  function restart() {
    connected = false
    if (listener.running) {
      restartAfterStop = true
      listener.running = false
    } else {
      start()
    }
  }

  property bool restartAfterStop: false

  Process {
    id: listener
    command: [root.listenCommand]

    stdout: SplitParser {
      onRead: function(line) {
        if (line.indexOf("Connected") !== -1) root.connected = true
        else if (line.indexOf("Disconnected") !== -1) root.connected = false
      }
    }

    stderr: SplitParser {
      onRead: function(line) {
        if (line.trim() !== "") console.warn("bubbles", line.trim())
      }
    }

    onExited: function() {
      root.connected = false
      if (root.restartAfterStop) {
        root.restartAfterStop = false
        Qt.callLater(root.start)
      } else {
        restartTimer.restart()
      }
    }
  }

  Timer {
    id: restartTimer
    interval: 5000
    repeat: false
    onTriggered: root.start()
  }

  Component.onCompleted: start()
}
