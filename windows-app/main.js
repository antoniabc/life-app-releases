// Life widget na Windows: małe okno bez ramki, zawsze na wierzchu, z tą samą apką co w przeglądarce.
const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const APP_URL = (!app.isPackaged && process.env.LIFE_URL) || "https://life-timer-786a.web.app/";
const APP_ORIGIN = new URL(APP_URL).origin;
const CARD = { width: 340, height: 580 };
const PILL = { width: 260, height: 78 };
const ZOOM = 0.8; // karta ma proporcje starego widgetu, treść apki lekko pomniejszona

let win = null;
let mini = false;
let pending = null; // trwające logowanie

const stateFile = () => path.join(app.getPath("userData"), "window.json");

function loadPosition() {
  try {
    const { x, y } = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      x >= a.x - 20 && y >= a.y - 20 && x < a.x + a.width - 60 && y < a.y + a.height - 40);
    if (visible) return { x, y };
  } catch {
    /* pierwszy start */
  }
  return {};
}

function savePosition() {
  if (!win) return;
  const [x, y] = win.getPosition();
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ x, y }));
  } catch {
    /* nieważne */
  }
}

function create() {
  win = new BrowserWindow({
    ...CARD,
    ...loadPosition(),
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: "#faf8fa",
    title: "Life",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      zoomFactor: ZOOM,
      autoplayPolicy: "no-user-gesture-required", // piknięcie po przekroczeniu planu
      backgroundThrottling: false,
    },
  });
  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(ZOOM));
  win.on("moved", savePosition);
  win.on("closed", () => (win = null));

  // tylko własna apka w oknie; inne linki w zwykłej przeglądarce
  win.webContents.on("will-navigate", (e, url) => {
    if (new URL(url).origin !== APP_ORIGIN) {
      e.preventDefault();
      if (url.startsWith("https://")) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-fail-load", (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) setTimeout(() => win?.loadURL(APP_URL), 5000);
  });
  // test w chmurze: zapisz, czy okno widzi apkę i jest na wierzchu, i zakończ
  if (process.env.LIFE_SMOKE) {
    win.webContents.once("did-finish-load", () => setTimeout(async () => {
      const bridge = await win.webContents.executeJavaScript("typeof window.lifeDesktop");
      fs.writeFileSync(process.env.LIFE_SMOKE, JSON.stringify({
        bridge, onTop: win.isAlwaysOnTop(), url: win.webContents.getURL(), size: win.getSize(),
      }));
      app.quit();
    }, 5000));
  }
  void win.loadURL(APP_URL);
}

const fromApp = (e) => !!e.senderFrame && new URL(e.senderFrame.url).origin === APP_ORIGIN;

ipcMain.on("mini", (e, value) => {
  if (!fromApp(e) || !win) return;
  mini = !!value;
  const size = mini ? PILL : CARD;
  win.setResizable(true);
  win.setSize(size.width, size.height);
  win.setResizable(false);
});

ipcMain.on("close", (e) => {
  if (fromApp(e)) app.quit();
});

// Google nie pozwala logować w oknach wbudowanych, więc logowanie odbywa się w zwykłej przeglądarce:
// strona apki loguje przez Google i odsyła token na jednorazowy adres 127.0.0.1.
ipcMain.handle("google-sign-in", (e) => {
  if (!fromApp(e)) throw new Error("forbidden");
  pending?.cancel();
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(16).toString("hex");
    const server = http.createServer((req, res) => {
      if (req.method !== "POST") return void res.writeHead(404).end();
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 20000) req.destroy();
      });
      req.on("end", () => {
        const form = new URLSearchParams(body);
        if (form.get("state") !== state || !form.get("id_token")) return void res.writeHead(400).end();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<meta charset=utf-8><body style='font-family:Georgia;text-align:center;margin-top:20vh'>" +
          "<h2>Zalogowano ✓</h2><p>Możesz zamknąć tę kartę i wrócić do widgetu.</p>");
        done(null, form.get("id_token"));
      });
    });
    const timer = setTimeout(() => done(new Error("timeout")), 180000);
    function done(err, token) {
      clearTimeout(timer);
      server.close();
      pending = null;
      if (err) reject(err);
      else resolve(token);
      win?.show();
    }
    pending = { cancel: () => done(new Error("cancelled")) };
    server.listen(0, "127.0.0.1", () => {
      const url = new URL(APP_URL);
      url.searchParams.set("widgetLogin", String(server.address().port));
      url.searchParams.set("state", state);
      void shell.openExternal(url.toString());
    });
  });
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => win?.show());
  app.whenReady().then(create);
  app.on("window-all-closed", () => app.quit());
}
