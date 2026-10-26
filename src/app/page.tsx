import { PublicApp } from "@/components/PublicApp";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { listPublicReports } from "@/lib/reports";
import { photosEnabled } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Las fotos solo se ofrecen al equipo; el servidor también lo valida al recibir el reporte.
  const [reports, staff, user] = await Promise.all([listPublicReports(), isStaff(), getCurrentUser()]);
  const admin = staff && user?.role === "admin";
  return (
    <PublicApp initialReports={reports} isStaff={staff} isAdmin={admin} photosEnabled={staff && photosEnabled()} />
  );
}
