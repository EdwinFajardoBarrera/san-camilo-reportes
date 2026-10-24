import type { Category, Status } from "./config";
import type { Line } from "./geo";

/** Reporte tal como se envía al navegador. */
export type Report = {
  id: string;
  category: Category;
  status: Status;
  description: string | null;
  reference: string | null;
  lat: number;
  lng: number;
  createdAt: string;
  resolvedAt: string | null;
  /** Trazo de la calle, si el reporte es de una calle completa. */
  path: Line[] | null;
  photoUrl: string | null;
  /** Nombre que el vecino eligió mostrar; null si es anónimo. */
  reporterName: string | null;
  supportCount: number;
  /** Usuario del equipo que hizo el último cambio de estado. Solo en el panel. */
  reviewedBy?: string | null;
};
