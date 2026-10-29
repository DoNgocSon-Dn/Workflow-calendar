const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  shell,
  screen,
  dialog,
  powerMonitor,
  nativeImage,
  net,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const {
  ORIGIN,
  isLocalPage,
  normalizeNotification,
  normalizeConnection,
} = require("./policy.cjs");
const { createWebServer } = require("./server.cjs");
const { AlertQueue } = require("./alerts.cjs");

app.setAppUserModelId("com.dongocson.workflowcalendar");
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  start();
}

function start() {
  let main,
    popup,
    settingsWindow,
    tray,
    webServer,
    alerts,
    connection,
    quitting = false;
  let lastPopupId = "",
    popupReady = false;
  const icon = path.join(__dirname, "icon.ico");
  const settingsFile = () =>
    path.join(app.getPath("userData"), "desktop-settings.json");
  const connectionFile = () =>
    path.join(app.getPath("userData"), "connection.json");
  let enabled = true;
  function showMain() {
    if (!main || main.isDestroyed()) return;
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
  }
  const trustedMain = (event) =>
    event.sender === main?.webContents &&
    event.senderFrame === main.webContents.mainFrame &&
    isLocalPage(event.senderFrame.url);
  const trustedSettings = (event) =>
    settingsWindow &&
    !settingsWindow.isDestroyed() &&
    event.sender === settingsWindow.webContents &&
    event.senderFrame === settingsWindow.webContents.mainFrame;
  function showSettings() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      return;
    }
    settingsWindow = new BrowserWindow({
      title: "Kết nối · Workflow",
      width: 650,
      height: 760,
      minWidth: 500,
      minHeight: 600,
      icon,
      webPreferences: {
        preload: path.join(__dirname, "settings-preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    settingsWindow.setMenu(null);
    settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    settingsWindow.webContents.on("will-navigate", (event) =>
      event.preventDefault(),
    );
    void settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  }
  const testReminder = () =>
    alerts.push({
      id: `test-${Date.now()}`,
      title: "Đến giờ xem lại lịch của bạn",
      body: "Popup này luôn nổi trên màn hình, kể cả khi cửa sổ Workflow đã đóng xuống khay hệ thống. Bạn có thể mở lịch hoặc nhắc lại sau 5 phút.",
      kind: "reminder",
      sound: true,
    });
  function updatePopup() {
    if (!popup || popup.isDestroyed()) return;
    const item = alerts.pending[0];
    if (!item || !enabled) {
      popup.hide();
      lastPopupId = "";
      return;
    }
    const area = screen.getPrimaryDisplay().workArea;
    const width = Math.min(440, area.width - 24),
      height = Math.min(350, area.height - 24);
    popup.setBounds({
      x: area.x + area.width - width - 18,
      y: area.y + area.height - height - 18,
      width,
      height,
    });
    if (popupReady)
      popup.webContents.send("popup:update", {
        item,
        count: alerts.pending.length,
        ring: item.id !== lastPopupId,
      });
    if (popupReady) lastPopupId = item.id;
    popup.showInactive();
    popup.setAlwaysOnTop(true, "screen-saver");
  }
  function setEnabled(value) {
    enabled = value;
    fs.writeFileSync(settingsFile(), JSON.stringify({ enabled }));
    buildMenu();
    updatePopup();
  }
  function buildMenu() {
    const notificationMenu = [
      {
        label: "Popup nổi trên màn hình",
        type: "checkbox",
        checked: enabled,
        click: (item) => setEnabled(item.checked),
      },
      {
        label: "Gửi nhắc lịch thử ngay",
        click: () => {
          setEnabled(true);
          testReminder();
        },
      },
      {
        label: "Nhắc thử sau 10 giây",
        click: () => {
          setEnabled(true);
          setTimeout(testReminder, 10000);
        },
      },
      { type: "separator" },
      { label: "Đóng cửa sổ = tiếp tục chạy ở khay hệ thống", enabled: false },
    ];
    const startup = {
      label: "Mở cùng Windows",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      enabled: app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR,
      click: (item) =>
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          args: ["--hidden"],
        }),
    };
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Mở Workflow Calendar", click: showMain },
        { type: "separator" },
        ...notificationMenu,
        startup,
        { type: "separator" },
        {
          label: "Thoát hẳn",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Workflow",
          submenu: [
            { label: "Mở cửa sổ", click: showMain },
            { label: "Cấu hình kết nối", click: showSettings },
            startup,
            { type: "separator" },
            {
              label: "Thoát hẳn",
              click: () => {
                quitting = true;
                app.quit();
              },
            },
          ],
        },
        { label: "Thông báo", submenu: notificationMenu },
        {
          label: "Chỉnh sửa",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "Hiển thị",
          submenu: [
            { role: "reload" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "togglefullscreen" },
          ],
        },
      ]),
    );
  }
  app.on("second-instance", showMain);
  app.on("before-quit", () => {
    quitting = true;
    webServer?.close();
  });
  app.on("window-all-closed", () => {
    /* keep tray and reminders alive */
  });
  app
    .whenReady()
    .then(async () => {
      try {
        enabled =
          JSON.parse(fs.readFileSync(settingsFile(), "utf8")).enabled !== false;
      } catch {
        /* defaults */
      }
      connection = normalizeConnection(require("./default-config.json"));
      try {
        connection = normalizeConnection(
          JSON.parse(fs.readFileSync(connectionFile(), "utf8")),
        );
      } catch {
        /* use packaged public defaults */
      }
      alerts = new AlertQueue(
        path.join(app.getPath("userData"), "reminders.json"),
        updatePopup,
      );
      const webRoot = app.isPackaged
        ? path.join(process.resourcesPath, "web")
        : path.join(__dirname, "../frontend/dist/frontend/browser");
      webServer = createWebServer(webRoot, () => connection);
      try {
        await new Promise((resolve, reject) => {
          webServer.once("error", reject);
          webServer.listen(42817, "127.0.0.1", resolve);
        });
      } catch {
        dialog.showErrorBox(
          "Không mở được Workflow",
          "Cổng 42817 đang được sử dụng. Hãy đóng phiên Workflow khác hoặc ứng dụng đang dùng cổng này rồi mở lại.",
        );
        quitting = true;
        app.quit();
        return;
      }
      main = new BrowserWindow({
        title: "Workflow Calendar",
        width: 1320,
        height: 880,
        minWidth: 800,
        minHeight: 600,
        icon,
        show: false,
        backgroundColor: "#f8fafc",
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
          spellcheck: false,
        },
      });
      main.webContents.session.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      main.webContents.session.setPermissionCheckHandler(() => false);
      main.webContents.setWindowOpenHandler(({ url }) => {
        try {
          if (["https:", "mailto:"].includes(new URL(url).protocol))
            void shell.openExternal(url);
        } catch {
          /* invalid link */
        }
        return { action: "deny" };
      });
      main.webContents.on("will-navigate", (event, url) => {
        if (!isLocalPage(url)) event.preventDefault();
      });
      main.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          main.hide();
        }
      });
      main.once("ready-to-show", () => {
        if (!process.argv.includes("--hidden")) showMain();
      });
      popup = new BrowserWindow({
        width: 440,
        height: 350,
        frame: false,
        resizable: false,
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        icon,
        backgroundColor: "#10251e",
        webPreferences: {
          preload: path.join(__dirname, "popup-preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
          autoplayPolicy: "no-user-gesture-required",
        },
      });
      popup.setMenu(null);
      popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      popup.webContents.on("will-navigate", (event) => event.preventDefault());
      popup.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          popup.hide();
        }
      });
      ipcMain.handle("desktop:settings", (event) => {
        if (trustedMain(event)) showSettings();
      });
      ipcMain.handle("settings:get", (event) =>
        trustedSettings(event) ? connection : null,
      );
      ipcMain.handle("settings:save", (event, input) => {
        if (!trustedSettings(event))
          throw new Error("Invalid settings request");
        connection = normalizeConnection(input);
        fs.writeFileSync(connectionFile(), JSON.stringify(connection));
        alerts.clear();
        void main.loadURL(`${ORIGIN}/login`);
        settingsWindow.close();
        showMain();
      });
      ipcMain.handle("settings:check", async (event, input) => {
        if (!trustedSettings(event))
          throw new Error("Invalid settings request");
        const config = normalizeConnection(input);
        const check = async (name, url, headers = {}) => {
          try {
            const response = await net.fetch(url, {
              headers,
              signal: AbortSignal.timeout(12000),
            });
            await response.body?.cancel();
            return `${name}: ${response.ok ? "Kết nối được" : `HTTP ${response.status}`}`;
          } catch {
            return `${name}: Không kết nối được (kiểm tra DNS, mạng hoặc trạng thái dịch vụ).`;
          }
        };
        return (
          await Promise.all([
            check("Supabase", `${config.supabaseUrl}/auth/v1/health`, {
              apikey: config.supabaseAnonKey,
            }),
            check("Backend", `${config.apiUrl}/`),
          ])
        ).join("\n");
      });
      ipcMain.handle("desktop:notify", (event, payload) => {
        if (!trustedMain(event)) return false;
        const item = normalizeNotification(payload);
        return enabled && item ? alerts.push(item) : false;
      });
      ipcMain.handle("desktop:clear", (event) => {
        if (trustedMain(event)) alerts.clear();
      });
      ipcMain.on("popup:ready", (event) => {
        if (event.sender !== popup.webContents) return;
        popupReady = true;
        updatePopup();
      });
      ipcMain.on("popup:action", (event, payload) => {
        if (event.sender !== popup.webContents || !payload) return;
        const item = alerts.act(payload.action, payload.id);
        if (item && payload.action === "open") {
          showMain();
          main.webContents.send("desktop:notification-click", item);
        }
      });
      tray = new Tray(
        nativeImage
          .createFromPath(path.join(__dirname, "icon.png"))
          .resize({ width: 20, height: 20 }),
      );
      tray.setToolTip("Workflow Calendar — nhắc lịch đang chạy");
      tray.on("double-click", showMain);
      buildMenu();
      await popup.loadFile(path.join(__dirname, "popup.html"));
      await main.loadURL(`${ORIGIN}/calendar`);
      setInterval(() => alerts.tick(), 1000).unref();
      powerMonitor.on("resume", () => {
        alerts.tick();
        updatePopup();
      });
      screen.on("display-metrics-changed", updatePopup);
    })
    .catch((error) => {
      dialog.showErrorBox("Workflow Calendar", error.message);
      quitting = true;
      app.quit();
    });
}
