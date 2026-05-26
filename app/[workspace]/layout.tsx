import { redirect } from "next/navigation";
import { requireMember } from "@/lib/tenant";

export default async function WorkspaceGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  try {
    await requireMember(slug);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") redirect(`/login`);
    if (msg === "NOT_A_MEMBER") redirect(`/`);
    throw e;
  }
  return <>{children}</>;
}
