const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "connectionSettings",
  Object.freeze({
    get: () => ipcRenderer.invoke("settings:get"),
    save: (config) => ipcRenderer.invoke("settings:save", config),
    check: (config) => ipcRenderer.invoke("settings:check", config),
  }),
);
