import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getMyWorkspaces } from "@/lib/tenant";
import { validateAuthorize, type AuthorizeInput } from "@/lib/oauth-authorize";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authorizeDecision } from "./actions";

export const runtime = "nodejs";

/** A client registered in the last day is the shape a phishing setup takes. */
const FRESH_CLIENT_MS = 24 * 60 * 60 * 1000;

function isFreshlyRegistered(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() < FRESH_CLIENT_MS;
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * OAuth consent screen. Reached only after `/api/oauth/authorize` validated the
 * request and confirmed a session, but re-validates defensively (it's directly
 * reachable). The user picks which workspace to grant the connector access to.
 *
 * The screen's job is to let someone answer "should I approve this?", so it
 * shows the two facts that actually decide it: where the authorization code
 * will be sent, and how long the application has existed. A client's display
 * name is chosen by whoever registered it and proves nothing — leading with the
 * name alone is what made a genuine authorize link usable as a phishing lure.
 */
export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    const qs = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v != null) as [string, string][],
    ).toString();
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  }

  const t = await getTranslations("oauth");
  const fmt = await getFormatter();

  const input: AuthorizeInput = {
    client_id: sp.client_id,
    redirect_uri: sp.redirect_uri,
    response_type: "code",
    code_challenge: sp.code_challenge,
    code_challenge_method: sp.code_challenge_method,
    state: sp.state,
    scope: sp.scope,
    resource: sp.resource,
  };
  const appOrigin = await origin();
  const v = await validateAuthorize(input, appOrigin);
  if (v.kind !== "ok") {
    return (
      <AuthShell title={t("invalidTitle")} subtitle={t("invalidSubtitle")}>
        <></>
      </AuthShell>
    );
  }

  const clientName = v.value.client.clientName ?? t("unnamedApp");
  const title = t("connectTitle", { app: clientName });

  // Only owners and admins may hand a connector access to a workspace; the
  // server action enforces the same rule.
  const workspaces = (await getMyWorkspaces(session.user.id)).filter(
    (w) => w.role === "owner" || w.role === "admin",
  );
  if (workspaces.length === 0) {
    return (
      <AuthShell title={title} subtitle={t("noAdminWorkspaces")}>
        <></>
      </AuthShell>
    );
  }

  // Where the authorization code actually goes. Compared against this
  // deployment's own origin so a self-hosted install doesn't warn about itself.
  const redirectUrl = new URL(v.value.redirectUri);
  const sendsCodeOffsite = redirectUrl.origin !== appOrigin;
  const createdAt = v.value.client.createdAt;
  const isFresh = isFreshlyRegistered(createdAt);

  return (
    <AuthShell title={title} subtitle={t("subtitle")}>
      <form action={authorizeDecision} className="space-y-5">
        <input type="hidden" name="client_id" value={v.value.client.id} />
        <input type="hidden" name="redirect_uri" value={v.value.redirectUri} />
        <input type="hidden" name="code_challenge" value={v.value.codeChallenge} />
        <input type="hidden" name="code_challenge_method" value="S256" />
        {v.value.state && (
          <input type="hidden" name="state" value={v.value.state} />
        )}
        <input type="hidden" name="scope" value={v.value.scopes.join(" ")} />
        {v.value.resource && (
          <input type="hidden" name="resource" value={v.value.resource} />
        )}

        <div
          className={
            sendsCodeOffsite
              ? "border border-destructive/50 bg-destructive/5 p-4 space-y-2"
              : "border border-border bg-surface p-4 space-y-2"
          }
        >
          <div className="text-sm">
            {t("destinationLabel")}{" "}
            <code className="font-mono font-medium break-all">
              {redirectUrl.host}
            </code>
          </div>
          {sendsCodeOffsite && (
            <p className="text-xs text-muted-foreground">
              {t("destinationOffsite")}
            </p>
          )}
          <div className="text-xs text-muted-foreground">
            {t("registered", { when: fmt.relativeTime(createdAt) })}
            {isFresh && <> — {t("registeredRecently")}</>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workspaceId">{t("workspaceLabel")}</Label>
          <Select name="workspaceId" defaultValue={workspaces[0].id} required>
            <SelectTrigger className="h-11" id="workspaceId">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} ({w.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border border-border bg-surface p-4 text-sm text-muted-foreground">
          {t("permissionLabel")}{" "}
          <code className="font-mono">{v.value.scopes.join(", ")}</code>
          {" — "}
          {t("permissionDetail")}
        </div>

        <div className="flex gap-3">
          <Button
            type="submit"
            name="decision"
            value="allow"
            className="flex-1 h-11"
          >
            {t("authorize")}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            className="flex-1 h-11"
          >
            {t("deny")}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
