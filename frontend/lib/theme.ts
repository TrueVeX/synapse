// Appearance (Light / Dark / System). Stored per device, like Claude and ChatGPT.

export type ThemeChoice = "dark" | "light" | "system";
export const THEME_KEY = "synapse_theme";

const THEME_COLORS = { dark: "#000000", light: "#ffffff" };

// Live (moving) background. On by default; saved per device.
export const LIVE_BG_KEY = "synapse_live_bg";

export function getLiveBackground(): boolean {
  try {
    return localStorage.getItem(LIVE_BG_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setLiveBackground(on: boolean) {
  try {
    localStorage.setItem(LIVE_BG_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  document.documentElement.dataset.liveBg = on ? "on" : "off";
}

export function getTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "system" || value === "dark") return value;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

function resolve(choice: ThemeChoice): "dark" | "light" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(choice: ThemeChoice) {
  const mode = resolve(choice);
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[mode]);
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage unavailable */
  }
  applyTheme(choice);
}

/** Follows the phone/PC setting live while "System" is chosen. */
export function watchSystemTheme() {
  const query = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => getTheme() === "system" && applyTheme("system");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Runs before the page paints, so a light-theme user never sees a dark flash. */
export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem("${LIVE_BG_KEY}")==="off")document.documentElement.dataset.liveBg="off"}catch(e){}try{var t=localStorage.getItem("${THEME_KEY}");var l=t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches);if(l){document.documentElement.classList.remove("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${THEME_COLORS.light}")}}catch(e){}`;
