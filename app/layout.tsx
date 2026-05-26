import type { Metadata } from "next";
import Script from "next/script";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { resolveLocale } from "@/i18n/request";
import { resolveTheme } from "@/lib/theme.server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const THEME_INIT_SCRIPT = `(function(){try{var c=document.cookie.match(/(?:^|; )THEME=([^;]+)/);var t=c?decodeURIComponent(c[1]):'system';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var d=document.documentElement;if(t==='light'){d.classList.add('light');}else{d.classList.remove('light');}}catch(e){}})();`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();
  const theme = await resolveTheme();
  const messages = await getMessages();
  const themeClass = theme === "light" ? "light" : "";

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${jetbrainsMono.variable} ${themeClass} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster position="bottom-center" duration={3000} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
