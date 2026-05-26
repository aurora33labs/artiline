export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const THEME_COOKIE = "THEME";
export const defaultTheme: Theme = "system";

export function isTheme(value: string | undefined): value is Theme {
  return !!value && (themes as readonly string[]).includes(value);
}
