import { z } from "zod";
import { CATEGORY_KEYS, NEIGHBORHOOD, categoryConfig, type Category, type LatLng } from "./config";
import { isPointInPolygon, paddedBounds, representativePoint, type Line } from "./geo";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

const [[south, west], [north, east]] = paddedBounds(NEIGHBORHOOD.polygon, 0.2);
const coordinate = z.tuple([z.number().min(west).max(east), z.number().min(south).max(north)]);

const pathSchema = z
  .array(z.array(coordinate).min(2).max(400))
  .min(1)
  .max(40)
  .refine((lines) => lines.flat().length <= 2000, "El trazo tiene demasiados puntos");

export const newReportSchema = z
  .object({
    category: z.enum(CATEGORY_KEYS as [Category, ...Category[]], {
      errorMap: () => ({ message: "Elige una categoría" }),
    }),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
    path: pathSchema.optional(),
    description: optionalText(500),
    reference: optionalText(150),
    reporterName: optionalText(60),
    // Campo trampa: los humanos no lo ven; si viene lleno es un bot.
    website: z.string().max(0, "Solicitud inválida").optional(),
  })
  .transform((r, ctx) => {
    const isStreet = categoryConfig(r.category).isStreet ?? false;
    let point: LatLng | null = null;
    let path: Line[] | null = null;

    if (isStreet) {
      if (!r.path) {
        ctx.addIssue({ code: "custom", message: "Marca la calle en el mapa", path: ["path"] });
        return z.NEVER;
      }
      path = r.path as Line[];
      point = representativePoint(path, NEIGHBORHOOD.polygon);
    } else if (r.lat !== undefined && r.lng !== undefined) {
      point = [r.lat, r.lng];
      if (!isPointInPolygon(point, NEIGHBORHOOD.polygon)) point = null;
    }

    if (!point) {
      ctx.addIssue({
        code: "custom",
        message: `El punto debe estar dentro de la colonia ${NEIGHBORHOOD.name}`,
        path: ["lat"],
      });
      return z.NEVER;
    }
    return {
      category: r.category,
      lat: point[0],
      lng: point[1],
      path,
      description: r.description,
      reference: r.reference,
      reporterName: r.reporterName,
    };
  });

export type NewReport = z.infer<typeof newReportSchema>;
