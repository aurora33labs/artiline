import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMyWorkspaces } from "@/lib/tenant";
import { landingMode } from "@/lib/landing";
import { MarketingHome } from "@/components/landing/marketing-home";
import { SelfHostHome } from "@/components/landing/self-host-home";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) {
    const workspaces = await getMyWorkspaces(session.user.id);
    if (workspaces.length === 1) redirect(`/${workspaces[0].slug}`);
    if (workspaces.length > 1) redirect(`/workspaces`);
    redirect(`/signup/workspace`);
  }

  return landingMode() === "marketing" ? <MarketingHome /> : <SelfHostHome />;
}
