import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  pickFromAcceptLanguage,
  type Locale,
} from "./routing";

export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headerStore = await headers();
  return pickFromAcceptLanguage(headerStore.get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    now: new Date(),
    timeZone: "UTC",
    defaultTranslationValues: { defaultLocale },
  };
});
