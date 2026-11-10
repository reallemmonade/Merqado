// Merqado for Mac and Windows: the full merqado.ai app in its own window.
// Google and Microsoft don't allow sign-in inside embedded windows, so sign-in runs in the
// default browser and comes back through merqado://auth (the same one-time code + PKCE
// handoff the iPhone app uses).
const { app, BrowserWindow, Menu, session, shell } = require("electron");
const { createHash, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const APP_URL = (process.env.MERQADO_URL || "https://merqado.ai").replace(/\/+$/, "");
const APP_ORIGIN = new URL(APP_URL).origin;
const SCHEME = "merqado";
const SESSION_COOKIE = "mq_session";

let win = null;
let pending = null; // { verifier, returnTo } while a browser sign-in is in flight
let queuedUrl = null; // deep link that arrived before the window was ready

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const link = argv.find((a) => a.startsWith(`${SCHEME}://`));
    if (link) handleDeepLink(link);
    focus();
  });
  app.on("open-url", (e, url) => {
    e.preventDefault();
    if (app.isReady() && win) handleDeepLink(url);
    else queuedUrl = url;
  });
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }
  app.whenReady().then(start);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (!win) createWindow();
  });
}

function start() {
  lockDownSession();
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  const link = queuedUrl || process.argv.find((a) => a.startsWith(`${SCHEME}://`));
  queuedUrl = null;
  if (link) handleDeepLink(link);
}

function isAppUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function lockDownSession() {
  const allowed = new Set(["notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "media"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(isAppUrl(wc.getURL()) && allowed.has(permission));
  });
}

// ---------- window ----------

const boundsFile = () => path.join(app.getPath("userData"), "window.json");

function savedBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsFile(), "utf8"));
  } catch {
    return { width: 1440, height: 900 };
  }
}

function createWindow() {
  const b = savedBounds();
  win = new BrowserWindow({
    width: b.width,
    height: b.height,
    x: b.x,
    y: b.y,
    minWidth: 900,
    minHeight: 600,
    title: "Merqado",
    backgroundColor: "#f6f5f9",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (b.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", () => {
    try {
      fs.writeFileSync(boundsFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
    } catch {}
  });
  win.on("closed", () => {
    win = null;
  });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      openExternal(url);
      return;
    }
    // Sign-in buttons post to /api/auth/start; run that in the default browser instead.
    if (new URL(url).pathname === "/api/auth/start") {
      e.preventDefault();
      beginBrowserSignIn();
    }
  });
  wc.on("will-redirect", (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      openExternal(url);
    }
  });
  wc.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */) return;
    win.loadFile(path.join(__dirname, "offline.html"), { query: { retry: url || APP_URL } });
  });

  win.loadURL(APP_URL);
}

function focus() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openExternal(url) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
}

// ---------- sign-in ----------

function currentReturnTo() {
  try {
    const u = new URL(win.webContents.getURL());
    if (u.origin !== APP_ORIGIN) return "/";
    if (u.pathname === "/login") return u.searchParams.get("returnTo") || "/";
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

function beginBrowserSignIn() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  pending = { verifier, returnTo: currentReturnTo() };
  shell.openExternal(`${APP_URL}/api/mobile/auth/finish?challenge=${challenge}`);
}

async function handleDeepLink(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    return;
  }
  focus();
  if (u.host !== "auth") return;
  const code = u.searchParams.get("code");
  if (!code || !pending) return;
  const { verifier, returnTo } = pending;
  pending = null;
  try {
    const res = await fetch(`${APP_URL}/api/mobile/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, verifier }),
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    const { token, expiresAt } = await res.json();
    await session.defaultSession.cookies.set({
      url: APP_URL,
      name: SESSION_COOKIE,
      value: token,
      path: "/",
      secure: APP_URL.startsWith("https:"),
      httpOnly: true,
      sameSite: "lax",
      expirationDate: Math.floor(new Date(expiresAt).getTime() / 1000),
    });
    const target = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    win.loadURL(APP_URL + target);
  } catch (err) {
    console.error("Desktop sign-in failed", err);
    win.loadURL(`${APP_URL}/login`);
  }
}

// ---------- menu ----------

function buildMenu() {
  const mac = process.platform === "darwin";
  const nav = (fn) => () => win && fn(win.webContents);
  return Menu.buildFromTemplate([
    ...(mac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: "CmdOrCtrl+[", click: nav((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: nav((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
        { label: "Home", accelerator: "CmdOrCtrl+Shift+H", click: nav((wc) => wc.loadURL(APP_URL)) },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]);
}
