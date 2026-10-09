/** UI preference cookies (client-safe). Read on the server so the first paint is correct. */
export const THEME_COOKIE = "hms_theme";
export const SIDEBAR_COOKIE = "hms_sidebar";

export type ThemeChoice = "light" | "dark";

export function parseTheme(v: string | undefined): ThemeChoice | undefined {
  return v === "light" || v === "dark" ? v : undefined;
}

/** Persist a preference for a year (not sensitive; readable by client code on purpose). */
export function setPreferenceCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}
