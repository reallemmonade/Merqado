// Merqado for Mac and Windows: the full merqado.ai app, in as many windows as you like (File >
// New Window, or Cmd/Ctrl-click a link). Every window on a case stays live with the others.
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

const windows = new Set();
let lastFocused = null;
let pending = null; // { verifier, returnTo, win } while a browser sign-in is in flight
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
    if (app.isReady() && windows.size) handleDeepLink(url);
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
    if (!windows.size) createWindow();
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

/** The window to act on: the focused one, else the one used last. */
function current() {
  const w = BrowserWindow.getFocusedWindow();
  if (w && windows.has(w)) return w;
  if (lastFocused && windows.has(lastFocused)) return lastFocused;
  return [...windows].pop() || null;
}

function createWindow(url = APP_URL) {
  const b = savedBounds();
  const from = current();
  // A second window opens a little down and right of the one it came from.
  const pos = from ? (({ x, y }) => ({ x: x + 32, y: y + 32 }))(from.getBounds()) : { x: b.x, y: b.y };
  const win = new BrowserWindow({
    width: from ? from.getBounds().width : b.width,
    height: from ? from.getBounds().height : b.height,
    ...pos,
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
  windows.add(win);
  if (!from && b.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("focus", () => {
    lastFocused = win;
  });
  win.on("close", () => {
    // The last window open remembers its size and place for next launch.
    if (windows.size > 1) return;
    try {
      fs.writeFileSync(boundsFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
    } catch {}
  });
  win.on("closed", () => {
    windows.delete(win);
    if (lastFocused === win) lastFocused = null;
  });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url: target }) => {
    // App links opened in a new tab or window (Cmd/Ctrl-click, target=_blank) get their own window.
    if (isAppUrl(target)) createWindow(target);
    else openExternal(target);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, target) => {
    if (!isAppUrl(target)) {
      e.preventDefault();
      openExternal(target);
      return;
    }
    // Sign-in buttons post to /api/auth/start; run that in the default browser instead.
    if (new URL(target).pathname === "/api/auth/start") {
      e.preventDefault();
      beginBrowserSignIn(win);
    }
  });
  wc.on("will-redirect", (e, target) => {
    if (!isAppUrl(target)) {
      e.preventDefault();
      openExternal(target);
    }
  });
  wc.on("did-fail-load", (_e, code, _desc, failed, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */) return;
    win.loadFile(path.join(__dirname, "offline.html"), { query: { retry: failed || APP_URL } });
  });

  win.loadURL(isAppUrl(url) ? url : APP_URL);
  return win;
}

/** File > New Window: the same page as the current window, to put on another screen. */
function newWindow() {
  const from = current();
  let url = APP_URL;
  try {
    if (from && isAppUrl(from.webContents.getURL())) url = from.webContents.getURL();
  } catch {}
  createWindow(url).focus();
}

function focus() {
  const win = current() || createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

function openExternal(url) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
}

// ---------- sign-in ----------

function currentReturnTo(win) {
  try {
    const u = new URL(win.webContents.getURL());
    if (u.origin !== APP_ORIGIN) return "/";
    if (u.pathname === "/login") return u.searchParams.get("returnTo") || "/";
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

function beginBrowserSignIn(win) {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  pending = { verifier, returnTo: currentReturnTo(win), win };
  shell.openExternal(`${APP_URL}/api/mobile/auth/finish?challenge=${challenge}`);
}

async function handleDeepLink(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    return;
  }
  const front = focus();
  if (u.host !== "auth") return;
  const code = u.searchParams.get("code");
  if (!code || !pending) return;
  const { verifier, returnTo } = pending;
  const win = pending.win && windows.has(pending.win) ? pending.win : front;
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
    // Other windows left on the sign-in page follow along.
    for (const other of windows) {
      if (other === win) continue;
      try {
        if (new URL(other.webContents.getURL()).pathname === "/login") other.webContents.reload();
      } catch {}
    }
  } catch (err) {
    console.error("Desktop sign-in failed", err);
    win.loadURL(`${APP_URL}/login`);
  }
}

// ---------- menu ----------

function buildMenu() {
  const mac = process.platform === "darwin";
  const nav = (fn) => () => {
    const win = current();
    if (win) fn(win.webContents);
  };
  return Menu.buildFromTemplate([
    ...(mac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [{ label: "New Window", accelerator: "CmdOrCtrl+N", click: newWindow }, { type: "separator" }, mac ? { role: "close" } : { role: "quit" }],
    },
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
