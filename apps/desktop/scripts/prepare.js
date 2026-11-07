// Copies the shared settings + offline page into the desktop app and draws the icon.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const apps = path.join(root, "..");

fs.copyFileSync(path.join(apps, "app.config.json"), path.join(root, "app.config.json"));
fs.copyFileSync(path.join(apps, "shared", "offline.html"), path.join(root, "offline.html"));

const { Resvg } = require("@resvg/resvg-js");
const svg = fs.readFileSync(path.join(apps, "shared", "icon.svg"), "utf8");
const png = new Resvg(svg, { fitTo: { mode: "width", value: 512 } }).render().asPng();
fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "icon.png"), png);

const { url } = JSON.parse(fs.readFileSync(path.join(root, "app.config.json"), "utf8"));
console.log(url ? `App will open: ${url}` : "No website URL set yet: the app will show 'not connected yet'.");
