"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const tt = useTranslations("toasts");
  const tc = useTranslations("common");
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success(tt("linkCopied"));
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {tc("copyLink")}
    </Button>
  );
}
