// Configuración de la colonia y de las categorías de reporte.
// Para usar la app en otra colonia basta con cambiar este archivo.

export type LatLng = [lat: number, lng: number];

export const NEIGHBORHOOD = {
  name: "San Camilo",
  city: "Mérida, Yucatán",
  // Contorno tomado del mapa original de Google My Maps.
  polygon: [
    [20.9818094, -89.5637876],
    [20.9620848, -89.5664579],
    [20.96725, -89.5405179],
    [20.9818094, -89.5400888],
  ] satisfies LatLng[],
  defaultZoom: 16,
  minZoom: 13,
} as const;

export const CATEGORIES = {
  bache: { label: "Bache", color: "#dc2626", icon: "🕳️" },
  alumbrado: { label: "Alumbrado público", color: "#ca8a04", icon: "💡" },
  inundacion: { label: "Calle inundada", color: "#2563eb", icon: "🌊" },
  sin_pavimentar: { label: "Calle sin pavimentar", color: "#78716c", icon: "🚧" },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export const STATUSES = ["pendiente", "aprobado", "rechazado", "resuelto"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  resuelto: "Resuelto",
};

/** Estados visibles para el público. */
export const PUBLIC_STATUSES: Status[] = ["aprobado", "resuelto"];

/** Máximo de reportes por persona (IP) en una ventana de tiempo. */
export const REPORT_RATE_LIMIT = { max: 5, windowMinutes: 60 };
/** Máximo de intentos fallidos de acceso al panel. */
export const LOGIN_RATE_LIMIT = { max: 5, windowMinutes: 15 };
