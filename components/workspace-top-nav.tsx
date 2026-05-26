import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireMember, getMyWorkspaces } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { UserMenu } from "@/components/user-menu";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { resolveTheme } from "@/lib/theme.server";

/**
 * Shared workspace chrome: sticky top nav header. Used by the (nav) route-group
 * layout and by standalone padded pages outside that group (e.g. version
 * history) that still want the full app shell.
 */
export async function WorkspaceTopNav({ slug }: { slug: string }) {
  const data = await requireMember(slug);
  const workspaces = await getMyWorkspaces(data.session.user.id);
  const t = await getTranslations("navTop");
  const theme = await resolveTheme();

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <span className="text-muted-foreground/40 select-none meta">/</span>
          <WorkspaceSwitcher
            current={{ slug: data.workspace.slug, name: data.workspace.name }}
            workspaces={workspaces.map((w) => ({
              slug: w.slug,
              name: w.name,
            }))}
          />
        </div>

        <nav className="hidden md:flex items-center gap-1 font-display text-[11px] font-medium uppercase tracking-[0.06em]">
          <Link
            href={`/${slug}`}
            className="px-3 py-1.5 rounded-sm hover:bg-surface-2 transition-colors"
          >
            {t("artifacts")}
          </Link>
          <Link
            href={`/${slug}/settings`}
            className="px-3 py-1.5 rounded-sm hover:bg-surface-2 transition-colors text-muted-foreground hover:text-foreground"
          >
            {t("team")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2">
            <ThemeSwitcher variant="nav-inline" current={theme} />
            <LocaleSwitcher variant="nav-inline" />
          </div>
          <Button asChild size="sm">
            <Link href={`/${slug}/new`}>
              <Plus className="size-4" />
              {t("new")}
            </Link>
          </Button>
          <UserMenu
            name={data.session.user.name ?? null}
            email={data.session.user.email ?? ""}
            image={data.session.user.image ?? null}
            theme={theme}
          />
        </div>
      </div>
    </header>
  );
}
