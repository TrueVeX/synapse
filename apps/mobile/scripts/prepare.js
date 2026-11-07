// Builds capacitor.config.json from apps/app.config.json and prepares the
// offline page + icon used by the Android app.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const apps = path.join(root, "..");
const { url = "", api = "" } = JSON.parse(fs.readFileSync(path.join(apps, "app.config.json"), "utf8"));
const siteUrl = url.trim().replace(/\/+$/, "");
// The backend host: Razorpay returns there after a full-page payment.
const apiHost = (() => {
  try {
    return api ? new URL(api).host : "";
  } catch {
    return "";
  }
})();

// www/ is what the app shows when it can't open the website.
fs.mkdirSync(path.join(root, "www"), { recursive: true });
const offline = fs.readFileSync(path.join(apps, "shared", "offline.html"), "utf8");
fs.writeFileSync(path.join(root, "www", "offline.html"), offline);
fs.writeFileSync(
  path.join(root, "www", "index.html"),
  siteUrl
    ? `<!doctype html><meta charset="utf-8"><script>location.replace(${JSON.stringify(siteUrl)})</script>`
    : offline.replace("<script>", `<script>history.replaceState(null, "", "?reason=not-configured");</script><script>`),
);

const config = {
  appId: "com.humanformstudios.synapse",
  appName: "SYNAPSE",
  webDir: "www",
  backgroundColor: "#262624",
  // Lets the website know it runs inside the app (hides Google sign-in,
  // which Google does not allow inside app web views).
  appendUserAgent: "SynapseApp/1.0",
  android: { allowMixedContent: false },
  server: siteUrl
    ? { url: siteUrl, errorPath: "offline.html", allowNavigation: ["*.razorpay.com", ...(apiHost ? [apiHost] : [])] }
    : { errorPath: "offline.html" },
};
fs.writeFileSync(path.join(root, "capacitor.config.json"), JSON.stringify(config, null, 2) + "\n");

// App icon (1024px) for @capacitor/assets.
const { Resvg } = require("@resvg/resvg-js");
const svg = fs.readFileSync(path.join(apps, "shared", "icon.svg"), "utf8");
fs.mkdirSync(path.join(root, "assets"), { recursive: true });
fs.writeFileSync(path.join(root, "assets", "icon.png"), new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render().asPng());
const splash = svg.replace('rx="224" fill="#d97757"', 'fill="#262624"');
fs.writeFileSync(path.join(root, "assets", "splash.png"), new Resvg(splash, { fitTo: { mode: "width", value: 2732 } }).render().asPng());

console.log(siteUrl ? `App will open: ${siteUrl}` : "No website URL set yet: the app will show 'not connected yet'.");
