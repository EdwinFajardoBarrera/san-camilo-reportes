import "server-only";
import { headers } from "next/headers";

/** IP del cliente según los encabezados del proxy (Vercel la pone en x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocida";
}
