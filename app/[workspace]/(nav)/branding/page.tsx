import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { requireMember, requireRole } from "@/lib/tenant";
import { isFeatureEnabled, currentEdition } from "@/lib/license";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateBranding,
  addCustomDomain,
  removeCustomDomain,
} from "./actions";

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role } = await requireMember(slug);
  requireRole(role, ["owner", "admin"]);

  const whiteLabelEnabled = await isFeatureEnabled("white_label", {
    workspaceId: workspace.id,
  });
  const customDomainEnabled = await isFeatureEnabled("custom_domain", {
    workspaceId: workspace.id,
  });

  if (!whiteLabelEnabled && !customDomainEnabled && currentEdition() === "oss") {
    notFound();
  }

  const branding = workspace.branding ?? {};
  const domains = await db
    .select()
    .from(schema.workspaceDomains)
    .where(eq(schema.workspaceDomains.workspaceId, workspace.id));

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">SETTINGS · BRANDING</div>
        <h1 className="text-3xl">Branding</h1>
        <p className="text-muted-foreground text-sm">
          Custom domain, white-label, sin marca Artiline en public footer.
        </p>
      </header>

      <section className="space-y-4 border border-border bg-surface p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            White-label
          </h2>
          {!whiteLabelEnabled && (
            <span className="meta text-warning border border-warning px-2 py-0.5">
              REQUIRES AGENCY TIER
            </span>
          )}
        </header>
        <form action={updateBranding} className="space-y-4">
          <input type="hidden" name="workspaceSlug" value={slug} />
          <div className="space-y-2">
            <Label htmlFor="brandName">Brand name (público)</Label>
            <Input
              id="brandName"
              name="brandName"
              maxLength={100}
              defaultValue={branding.brandName ?? ""}
              disabled={!whiteLabelEnabled}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              name="logoUrl"
              type="url"
              maxLength={500}
              defaultValue={branding.logoUrl ?? ""}
              disabled={!whiteLabelEnabled}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Primary color (OKLCH o hex)</Label>
            <Input
              id="primaryColor"
              name="primaryColor"
              maxLength={64}
              placeholder="oklch(0.6 0.2 280)"
              defaultValue={branding.primaryColor ?? ""}
              disabled={!whiteLabelEnabled}
              className="h-11 font-mono text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hideFooterChip"
              defaultChecked={branding.hideFooterChip ?? false}
              disabled={!whiteLabelEnabled}
              className="size-4 accent-primary"
            />
            <span>Ocultar &quot;Hosted on Artiline&quot; en public footer</span>
          </label>
          <Button type="submit" disabled={!whiteLabelEnabled}>
            Guardar
          </Button>
        </form>
      </section>

      <section className="space-y-4 border border-border bg-surface p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            Custom domains
          </h2>
          {!customDomainEnabled && (
            <span className="meta text-warning border border-warning px-2 py-0.5">
              REQUIRES AGENCY TIER
            </span>
          )}
        </header>
        <form action={addCustomDomain} className="flex gap-2">
          <input type="hidden" name="workspaceSlug" value={slug} />
          <Input
            name="hostname"
            placeholder="share.your-agency.com"
            disabled={!customDomainEnabled}
            className="h-11"
          />
          <Button type="submit" disabled={!customDomainEnabled}>
            Agregar
          </Button>
        </form>
        {domains.length > 0 && (
          <ul className="divide-y divide-border border border-border bg-background">
            {domains.map((d) => (
              <li
                key={d.id}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <code className="font-mono text-sm">{d.hostname}</code>
                  <div className="meta">
                    STATUS · {d.status.toUpperCase()}
                    {d.sslStatus && ` · SSL ${d.sslStatus.toUpperCase()}`}
                  </div>
                </div>
                <form action={removeCustomDomain}>
                  <input type="hidden" name="workspaceSlug" value={slug} />
                  <input type="hidden" name="domainId" value={d.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Eliminar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
