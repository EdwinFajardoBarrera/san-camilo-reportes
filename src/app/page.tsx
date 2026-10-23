import { PublicApp } from "@/components/PublicApp";
import { isAdmin } from "@/lib/auth";
import { listPublicReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [reports, admin] = await Promise.all([listPublicReports(), isAdmin()]);
  return <PublicApp initialReports={reports} isAdmin={admin} />;
}
