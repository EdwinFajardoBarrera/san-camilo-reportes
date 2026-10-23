import { z } from "zod";
import { CATEGORY_KEYS, NEIGHBORHOOD, type Category } from "./config";
import { isPointInPolygon } from "./geo";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

export const newReportSchema = z
  .object({
    category: z.enum(CATEGORY_KEYS as [Category, ...Category[]], {
      errorMap: () => ({ message: "Elige una categoría" }),
    }),
    lat: z.number().finite(),
    lng: z.number().finite(),
    description: optionalText(500),
    reference: optionalText(150),
    // Campo trampa: los humanos no lo ven; si viene lleno es un bot.
    website: z.string().max(0, "Solicitud inválida").optional(),
  })
  .refine((r) => isPointInPolygon([r.lat, r.lng], NEIGHBORHOOD.polygon), {
    message: `El punto debe estar dentro de la colonia ${NEIGHBORHOOD.name}`,
    path: ["lat"],
  });

export type NewReport = z.infer<typeof newReportSchema>;
