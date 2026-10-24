import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addFixedVote } from "@/lib/reports";
import { getClientIp } from "@/lib/request";
import { anonymize } from "@/lib/secrets";

/** Un vecino avisa que el problema ya se arregló. Se cuenta una vez por persona. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Reporte inválido" }, { status: 404 });

  const count = await addFixedVote(id.data, anonymize(`arreglado:${await getClientIp()}`));
  if (count === null) return NextResponse.json({ error: "Este reporte no está abierto" }, { status: 404 });

  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ count });
}
