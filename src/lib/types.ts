import type { Category, Status } from "./config";

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
};
