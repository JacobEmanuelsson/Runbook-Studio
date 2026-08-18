import { redirect } from "next/navigation";
import { RunbookStudio } from "@/components/runbook-studio";
import { demoDashboard } from "@/lib/demo-dashboard";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  if (!process.env.DATABASE_URL) {
    redirect("/demo");
  }

  let session = null;
  let loadError = "";

  try {
    const { getCurrentSession } = await import("@/server/auth/require-session");
    session = await getCurrentSession();
  } catch (error) {
    console.error(error);
    loadError = "Saved workspace is unavailable. Showing the local demo.";
  }

  if (loadError) {
    return <RunbookStudio dashboard={demoDashboard} loadError={loadError} mode="demo" />;
  }

  if (!session?.user) {
    redirect("/sign-in");
  }

  let dashboard = demoDashboard;
  let mode = "database";

  try {
    const { getOrCreateDashboardForUser } = await import("@/server/dashboard/dashboard-service");
    dashboard = (await getOrCreateDashboardForUser(session.user)) ?? demoDashboard;
  } catch (error) {
    console.error(error);
    mode = "demo";
    loadError = "Database workspace unavailable. Showing the local demo.";
  }

  return <RunbookStudio currentUser={session.user} dashboard={dashboard} loadError={loadError} mode={mode} />;
}
