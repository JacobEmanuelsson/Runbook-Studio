import { RunbookStudio } from "@/components/runbook-studio";
import { initialIncidents, runbooks, services, teamMembers } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

const demoDashboard = {
  organization: null,
  services,
  runbooks,
  incidents: initialIncidents,
  teamMembers,
};

export default async function Home() {
  let dashboard = demoDashboard;
  let currentUser = null;
  let mode = "demo";
  let loadError = "";

  if (process.env.DATABASE_URL) {
    try {
      const [{ getCurrentSession }, { getOrCreateDashboardForUser }] = await Promise.all([
        import("@/server/auth/require-session"),
        import("@/server/dashboard/dashboard-service"),
      ]);
      const session = await getCurrentSession();
      currentUser = session?.user ?? null;

      if (currentUser) {
        dashboard = (await getOrCreateDashboardForUser(currentUser)) ?? demoDashboard;
        mode = "database";
      }
    } catch (error) {
      console.error(error);
      loadError = "Database workspace unavailable. Showing local demo data.";
    }
  }

  return <RunbookStudio currentUser={currentUser} dashboard={dashboard} loadError={loadError} mode={mode} />;
}
