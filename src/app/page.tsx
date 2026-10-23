import { PublicApp } from "@/components/PublicApp";
import { listPublicReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const reports = await listPublicReports();
  return <PublicApp initialReports={reports} />;
}
