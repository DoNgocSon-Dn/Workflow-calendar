const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "reminderPopup",
  Object.freeze({
    ready: () => ipcRenderer.send("popup:ready"),
    act: (action, id) => ipcRenderer.send("popup:action", { action, id }),
    onUpdate: (callback) =>
      ipcRenderer.on("popup:update", (_event, payload) => callback(payload)),
  }),
);
