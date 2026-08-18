import { RunbookStudio } from "@/components/runbook-studio";
import { demoDashboard } from "@/lib/demo-dashboard";

export default function DemoPage() {
  return <RunbookStudio dashboard={demoDashboard} mode="demo" />;
}
