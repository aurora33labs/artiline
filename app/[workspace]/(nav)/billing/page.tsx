import { eq } from "drizzle-orm";
import dynamic from "next/dynamic";
import { db, schema } from "@/lib/db";
import { currentEdition } from "@/lib/license";
import { requireMember, requireRole } from "@/lib/tenant";

const CheckoutButton = dynamic(() =>
  import("@/components/cloud/billing-buttons").then((m) => m.CheckoutButton),
);
const PortalButton = dynamic(() =>
  import("@/components/cloud/billing-buttons").then((m) => m.PortalButton),
);

export default async function BillingPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role } = await requireMember(slug);

  if (currentEdition() !== "cloud") {
    return (
      <div className="space-y-6 max-w-3xl">
        <header className="space-y-2 border-b border-border pb-6">
          <div className="meta">SETTINGS · BILLING</div>
          <h1 className="text-3xl">Billing</h1>
        </header>
        <div className="border border-border bg-surface p-6 space-y-3">
          <p className="text-base font-sans font-semibold normal-case tracking-normal">
            Self-host
          </p>
          <p className="text-muted-foreground text-sm">
            Estás corriendo Artiline en modo OSS. Billing solo aplica al hosted
            SaaS. Si quieres features paid en tu deployment, configura
            <code className="mx-1 font-mono">LICENSE_KEY</code> en tus
            variables de entorno.
          </p>
        </div>
      </div>
    );
  }

  requireRole(role, ["owner", "admin"]);

  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.workspaceId, workspace.id))
    .limit(1);

  const { PRICING_PLANS } = await import("@/lib/cloud/pricing");
  const plans = Object.values(PRICING_PLANS);

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">SETTINGS · BILLING</div>
        <h1 className="text-3xl">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Tier actual:{" "}
          <span className="font-display font-bold text-primary">
            {sub ? sub.tier.toUpperCase() : "—"}
          </span>
          {sub && ` (${sub.status})`}
        </p>
      </header>

      {sub && (
        <section className="border border-border bg-surface p-6 space-y-3">
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            Tu suscripción
          </h2>
          <p className="text-muted-foreground text-sm">
            Stripe customer{" "}
            <code className="font-mono">{sub.stripeCustomerId}</code>
            {sub.currentPeriodEnd &&
              ` · renovación ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}
          </p>
          <PortalButton workspaceSlug={slug} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Planes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
          {plans.map((plan) => {
            const isCurrent = sub?.tier === plan.tier;
            return (
              <article
                key={plan.tier}
                className="bg-surface p-6 space-y-3 flex flex-col"
              >
                <header className="space-y-1">
                  <div className="meta">{plan.name.toUpperCase()}</div>
                  <div className="font-display font-bold text-3xl">
                    ${plan.price}
                    <span className="meta align-middle"> /MO</span>
                  </div>
                </header>
                <p className="text-muted-foreground text-sm flex-1">
                  {plan.description}
                </p>
                <div className="meta">
                  {plan.seats} SEATS
                </div>
                {isCurrent ? (
                  <span className="meta border border-primary text-primary px-3 py-2 text-center">
                    PLAN ACTUAL
                  </span>
                ) : (
                  <CheckoutButton
                    workspaceSlug={slug}
                    tier={plan.tier as "studio" | "agency" | "agency_plus"}
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
