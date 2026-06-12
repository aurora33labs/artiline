import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { Resend as ResendSDK } from "resend";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { defaultLocale } from "@/i18n/routing";

const FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";
const RESEND_KEY = process.env.RESEND_API_KEY;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.authAccounts,
    sessionsTable: schema.authSessions,
    verificationTokensTable: schema.authVerificationTokens,
  }),
  session: { strategy: "database" },
  // Artiline always runs behind a reverse proxy (Railway, Nginx, etc), so trust
  // the forwarded host. Without this NextAuth v5 throws UntrustedHost and login
  // breaks on self-host deployments. AUTH_TRUST_HOST env can still override.
  trustHost: true,
  pages: { signIn: "/login", verifyRequest: "/login/check-email" },
  providers: [
    Resend({
      apiKey: RESEND_KEY ?? "dev-noop",
      from: FROM,
      async sendVerificationRequest({ identifier, url }) {
        if (!RESEND_KEY) {
          console.log(
            `\n=== Magic link for ${identifier} ===\n${url}\n=================================\n`,
          );
          return;
        }
        const t = await getTranslations({ locale: defaultLocale, namespace: "emails.magicLink" });
        const resend = new ResendSDK(RESEND_KEY);
        const { error } = await resend.emails.send({
          from: FROM,
          to: identifier,
          subject: t("subject"),
          html: `<p>${t("body")}</p><p><a href="${url}">${url}</a></p>`,
        });
        if (error) throw new Error(error.message);
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
