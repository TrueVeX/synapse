// Appearance (Light / Dark / System). Stored per device, like Claude and ChatGPT.

export type ThemeChoice = "dark" | "light" | "system";
export const THEME_KEY = "synapse_theme";

const THEME_COLORS = { dark: "#262624", light: "#faf9f5" };

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
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");var l=t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches);if(l){document.documentElement.classList.remove("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${THEME_COLORS.light}")}}catch(e){}`;
