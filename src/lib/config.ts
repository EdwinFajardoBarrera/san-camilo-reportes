// Configuración de la colonia y de las categorías de reporte.
// Para usar la app en otra colonia basta con cambiar este archivo.

export type LatLng = [lat: number, lng: number];

export const NEIGHBORHOOD = {
  name: "San Camilo",
  city: "Kanasín, Yucatán",
  // Contorno tomado del mapa original de Google My Maps.
  polygon: [
    [20.9818094, -89.5637876],
    [20.9620848, -89.5664579],
    [20.96725, -89.5405179],
    [20.9818094, -89.5400888],
  ] satisfies LatLng[],
  minZoom: 13,
  // Margen alrededor de la colonia hasta donde se puede mover el mapa,
  // relativo a su tamaño (1 = una colonia de ancho hacia cada lado).
  panMargin: 1,
} as const;

/**
 * Estilo vectorial del mapa base. OpenFreeMap es gratuito, de código abierto,
 * sin API key ni límites de uso. Alternativas: "positron" (más sobrio) o "bright".
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type CategoryConfig = {
  label: string;
  color: string;
  icon: string;
  /** Se reporta trazando la calle en lugar de un solo punto. */
  isStreet?: boolean;
  /** Los vecinos pueden apoyar la iniciativa (p. ej. pavimentar). */
  supportLabel?: string;
};

export const CATEGORIES = {
  bache: { label: "Bache", color: "#dc2626", icon: "🕳️" },
  alumbrado: { label: "Alumbrado público", color: "#ca8a04", icon: "💡" },
  inundacion: { label: "Calle inundada", color: "#2563eb", icon: "🌊" },
  sin_pavimentar: {
    label: "Calle sin pavimentar",
    color: "#78716c",
    icon: "🚧",
    isStreet: true,
    supportLabel: "Apoyo la pavimentación",
  },
} as const satisfies Record<string, CategoryConfig>;

export type Category = keyof typeof CATEGORIES;
export const categoryConfig = (c: Category): CategoryConfig => CATEGORIES[c];
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export const STATUSES = ["pendiente", "aprobado", "rechazado", "resuelto"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  resuelto: "Arreglado",
};

/** Estados visibles para el público. */
export const PUBLIC_STATUSES: Status[] = ["aprobado", "resuelto"];

/** Máximo de reportes por persona (IP) en una ventana de tiempo. */
export const REPORT_RATE_LIMIT = { max: 5, windowMinutes: 60 };
/** Máximo de intentos fallidos de acceso al panel. */
export const LOGIN_RATE_LIMIT = { max: 5, windowMinutes: 15 };

/** Fotos: tamaño máximo aceptado (ya comprimidas en el navegador) y dimensión mayor. */
export const PHOTO = { maxBytes: 1_000_000, maxDimension: 1280, quality: 0.72 };
