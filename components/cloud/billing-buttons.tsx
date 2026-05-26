"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CheckoutButton({
  workspaceSlug,
  tier,
}: {
  workspaceSlug: string;
  tier: "studio" | "agency" | "agency_plus";
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => {
        start(async () => {
          const res = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceSlug, tier }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            toast.error(body.error ?? "Checkout failed");
            return;
          }
          const { url } = (await res.json()) as { url: string };
          window.location.href = url;
        });
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      Suscribirse
    </Button>
  );
}

export function PortalButton({ workspaceSlug }: { workspaceSlug: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const res = await fetch("/api/billing/portal", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceSlug }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            toast.error(body.error ?? "Portal failed");
            return;
          }
          const { url } = (await res.json()) as { url: string };
          window.location.href = url;
        });
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      Gestionar suscripción
    </Button>
  );
}
