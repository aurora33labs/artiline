import "server-only";
import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme, defaultTheme, type Theme } from "./theme";

export async function resolveTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : defaultTheme;
}
