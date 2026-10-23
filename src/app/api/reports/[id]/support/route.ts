import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORY_KEYS, categoryConfig } from "@/lib/config";
import { addSupport } from "@/lib/reports";
import { getClientIp } from "@/lib/request";
import { anonymize } from "@/lib/secrets";

const SUPPORTABLE = CATEGORY_KEYS.filter((c) => categoryConfig(c).supportLabel);

/** Un vecino apoya la iniciativa. Repetir no suma: se cuenta una vez por persona. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Reporte inválido" }, { status: 404 });

  const count = await addSupport(id.data, anonymize(`apoyo:${await getClientIp()}`), SUPPORTABLE);
  if (count === null) return NextResponse.json({ error: "Este reporte no admite apoyos" }, { status: 404 });

  revalidatePath("/");
  return NextResponse.json({ count });
}
