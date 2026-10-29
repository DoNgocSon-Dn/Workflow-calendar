const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "workflowDesktop",
  Object.freeze({
    openSettings: () => ipcRenderer.invoke("desktop:settings"),
    notify: (payload) => ipcRenderer.invoke("desktop:notify", payload),
    clearNotifications: () => ipcRenderer.invoke("desktop:clear"),
    onNotificationClick: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:notification-click", listener);
      return () =>
        ipcRenderer.removeListener("desktop:notification-click", listener);
    },
  }),
);
