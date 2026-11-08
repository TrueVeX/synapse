// SYNAPSE for Windows: a window that opens the SYNAPSE website.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

function readConfig() {
  // Packaged app: copied next to main.js. Development: ../app.config.json
  for (const file of [path.join(__dirname, "app.config.json"), path.join(__dirname, "..", "app.config.json")]) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      /* try the next location */
    }
  }
  return {};
}

const SITE_URL = (readConfig().url || "").trim().replace(/\/+$/, "");
const OFFLINE_PAGE = path.join(__dirname, "offline.html");
// Payment pop-ups (UPI, netbanking, card checks) may open in new windows.
const POPUP_HOSTS = ["razorpay.com", "api.razorpay.com", "checkout.razorpay.com"];

function isSameSite(url) {
  try {
    return SITE_URL && new URL(url).origin === new URL(SITE_URL).origin;
  } catch {
    return false;
  }
}

function isPaymentPopup(url) {
  try {
    const host = new URL(url).hostname;
    return POPUP_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    title: "SYNAPSE",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Lets the website know it is inside the app (it hides Google sign-in,
  // which Google does not allow inside app windows).
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} SynapseApp/${app.getVersion()}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isPaymentPopup(url)) return { action: "allow" };
    if (!isSameSite(url) && /^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isSameSite(url) || isPaymentPopup(url) || url.startsWith("file:")) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  win.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* navigation replaced */) return;
    win.loadFile(OFFLINE_PAGE, { query: { retry: url || SITE_URL } });
  });

  if (SITE_URL) win.loadURL(SITE_URL);
  else win.loadFile(OFFLINE_PAGE, { query: { reason: "not-configured" } });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
