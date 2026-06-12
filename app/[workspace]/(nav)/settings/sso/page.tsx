import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { requireMemberPage, requireRolePage } from "@/lib/tenant";
import { isFeatureEnabled, currentEdition } from "@/lib/license";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateSsoConfig } from "./actions";

type StoredSaml = {
  entityID?: string;
  ssoUrl?: string;
  x509cert?: string;
  attributeMap?: { email?: string; name?: string };
  allowedDomains?: string[];
};

export default async function SsoSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role } = await requireMemberPage(slug);
  requireRolePage(role, ["owner", "admin"]);

  const enabledFeature = await isFeatureEnabled("sso_saml", {
    workspaceId: workspace.id,
  });
  if (!enabledFeature && currentEdition() === "oss") notFound();

  const [row] = await db
    .select()
    .from(schema.ssoConfigs)
    .where(eq(schema.ssoConfigs.workspaceId, workspace.id))
    .limit(1);

  const cfg = (row?.config ?? {}) as StoredSaml;
  const isEnabled = row?.enabled ?? false;

  const h = await headers();
  const host = h.get("host") ?? "localhost:1355";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const acsUrl = `${origin}/api/sso/${slug}/callback`;
  const spEntityID = `${origin}/api/sso/${slug}/metadata`;
  const startUrl = `${origin}/sso/${slug}`;

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">SETTINGS · SSO</div>
        <h1 className="text-3xl">SAML SSO</h1>
        <p className="text-muted-foreground text-sm">
          Inicio de sesión empresarial vía el IdP del cliente (Okta, Azure AD,
          Google Workspace). Requiere tier Agency+.
        </p>
      </header>

      {!enabledFeature && (
        <div className="meta text-warning border border-warning px-3 py-2 inline-block">
          REQUIRES AGENCY+ TIER
        </div>
      )}

      <section className="space-y-4 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Datos para el IdP del cliente
        </h2>
        <p className="text-muted-foreground text-sm">
          Configura estos valores en el IdP del cliente.
        </p>
        <dl className="space-y-3 text-sm">
          <Field label="SP Entity ID" value={spEntityID} />
          <Field label="ACS / Reply URL" value={acsUrl} />
          <Field label="Metadata XML" value={`${spEntityID}`} link />
          <Field label="Login URL (compartir con empleados)" value={startUrl} link />
        </dl>
      </section>

      <section className="space-y-4 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Configuración del IdP
        </h2>
        <form action={updateSsoConfig} className="space-y-4">
          <input type="hidden" name="workspaceSlug" value={slug} />

          <div className="space-y-2">
            <Label htmlFor="entityID">IdP Entity ID (issuer)</Label>
            <Input
              id="entityID"
              name="entityID"
              type="url"
              required
              defaultValue={cfg.entityID ?? ""}
              disabled={!enabledFeature}
              className="h-11 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ssoUrl">IdP SSO URL</Label>
            <Input
              id="ssoUrl"
              name="ssoUrl"
              type="url"
              required
              defaultValue={cfg.ssoUrl ?? ""}
              disabled={!enabledFeature}
              className="h-11 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="x509cert">IdP x509 Certificate (firma)</Label>
            <Textarea
              id="x509cert"
              name="x509cert"
              required
              rows={6}
              placeholder="MIID...&#10;(pegar certificado PEM/base64)"
              defaultValue={cfg.x509cert ?? ""}
              disabled={!enabledFeature}
              className="font-mono text-xs"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="attrEmail">Atributo email</Label>
              <Input
                id="attrEmail"
                name="attrEmail"
                defaultValue={cfg.attributeMap?.email ?? "email"}
                disabled={!enabledFeature}
                className="h-11 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="attrName">Atributo nombre (opcional)</Label>
              <Input
                id="attrName"
                name="attrName"
                defaultValue={cfg.attributeMap?.name ?? ""}
                disabled={!enabledFeature}
                className="h-11 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowedDomains">
              Dominios permitidos (separados por coma)
            </Label>
            <Input
              id="allowedDomains"
              name="allowedDomains"
              placeholder="cliente.com, filial.cliente.com"
              defaultValue={(cfg.allowedDomains ?? []).join(", ")}
              disabled={!enabledFeature}
              className="h-11 font-mono text-sm"
            />
            <p className="meta text-muted-foreground">
              Solo emails de estos dominios pueden unirse automáticamente. Los
              miembros existentes siempre pueden entrar.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={isEnabled}
              disabled={!enabledFeature}
              className="size-4 accent-primary"
            />
            <span>Habilitar SSO para este workspace</span>
          </label>

          <Button type="submit" disabled={!enabledFeature}>
            Guardar
          </Button>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="meta text-muted-foreground shrink-0">{label}</dt>
      <dd className="font-mono text-xs break-all sm:text-right">
        {link ? (
          <a href={value} className="text-primary hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
