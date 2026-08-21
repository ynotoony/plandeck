// input: localStorage + matchMedia
// output: themeState/applyTheme：system|light|dark
// position: 主题模块
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "plandeck-theme";
const THEMES = new Set<Theme>(["system", "light", "dark"]);

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && THEMES.has(value as Theme) ? (value as Theme) : "system";
  } catch {
    return "system";
  }
}

function resolvedTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const themeState = $state({ selected: storedTheme() });

export function applyTheme(theme: Theme): void {
  const resolved = resolvedTheme(theme);
  themeState.selected = theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Theme switching still works when WebView storage is unavailable.
  }
}

export function initTheme(): () => void {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const syncSystemTheme = (): void => {
    if (themeState.selected === "system") applyTheme("system");
  };
  applyTheme(themeState.selected);
  media.addEventListener("change", syncSystemTheme);
  return () => media.removeEventListener("change", syncSystemTheme);
}
