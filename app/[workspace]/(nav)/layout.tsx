import { WorkspaceTopNav } from "@/components/workspace-top-nav";

export default async function WorkspaceNavLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;

  return (
    <>
      <WorkspaceTopNav slug={slug} />
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">
        {children}
      </div>
    </>
  );
}
