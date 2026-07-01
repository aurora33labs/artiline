import { redirect } from "next/navigation";
import { headers } from "next/headers";
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
  const v = await validateAuthorize(input, await origin());
  if (v.kind !== "ok") {
    return (
      <AuthShell
        title="Solicitud inválida"
        subtitle="No se pudo validar la solicitud de conexión."
      >
        <></>
      </AuthShell>
    );
  }

  const workspaces = await getMyWorkspaces(session.user.id);
  const clientName = v.value.client.clientName ?? "una aplicación externa";

  if (workspaces.length === 0) {
    return (
      <AuthShell
        title={`Conectar ${clientName}`}
        subtitle="Necesitas un workspace antes de conectar una aplicación."
      >
        <></>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Conectar ${clientName}`}
      subtitle="Esta aplicación podrá crear artifacts en el workspace que elijas."
    >
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

        <div className="space-y-2">
          <Label htmlFor="workspaceId">Workspace</Label>
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
          Permiso solicitado:{" "}
          <code className="font-mono">{v.value.scopes.join(", ")}</code> — crear
          artifacts.
        </div>

        <div className="flex gap-3">
          <Button
            type="submit"
            name="decision"
            value="allow"
            className="flex-1 h-11"
          >
            Autorizar
          </Button>
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            className="flex-1 h-11"
          >
            Denegar
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
