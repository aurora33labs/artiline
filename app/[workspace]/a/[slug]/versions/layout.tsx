import { WorkspaceTopNav } from "@/components/workspace-top-nav";

/**
 * Version history lives under /a/[slug] (outside the (nav) route group, which
 * is reserved for the chromeless fullscreen artifact viewer). It still wants
 * the full app shell, so it brings its own copy of the chrome.
 */
export default async function VersionsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string; slug: string }>;
}) {
  const { workspace: slug } = await params;

  return (
    <>
      <WorkspaceTopNav slug={slug} />
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 pt-10 pb-24 md:pb-10">
        {children}
      </div>
    </>
  );
}
