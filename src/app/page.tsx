import { PublicApp } from "@/components/PublicApp";
import { isStaff } from "@/lib/auth";
import { listPublicReports } from "@/lib/reports";
import { photosEnabled } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [reports, staff] = await Promise.all([listPublicReports(), isStaff()]);
  return <PublicApp initialReports={reports} isStaff={staff} photosEnabled={photosEnabled()} />;
}
