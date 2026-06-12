import { requireMemberPage } from "@/lib/tenant";

export default async function WorkspaceGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  await requireMemberPage(slug);
  return <>{children}</>;
}
