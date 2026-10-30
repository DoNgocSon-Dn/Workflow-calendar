const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "workflowDesktop",
  Object.freeze({
    openSettings: () => ipcRenderer.invoke("desktop:settings"),
    notify: (payload) => ipcRenderer.invoke("desktop:notify", payload),
    clearNotifications: () => ipcRenderer.invoke("desktop:clear"),
    acknowledgeNotificationClick: (id) => ipcRenderer.invoke("desktop:notification-ack", id),
    onNotificationClick: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:notification-click", listener);
      ipcRenderer.send("desktop:ready");
      return () =>
        ipcRenderer.removeListener("desktop:notification-click", listener);
    },
    onNotificationCancelled: (callback) => {
      const listener = (_event, id) => callback(id);
      ipcRenderer.on("desktop:notification-cancelled", listener);
      return () => ipcRenderer.removeListener("desktop:notification-cancelled", listener);
    },
  }),
);
