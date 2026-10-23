// Fechas mostradas siempre en la hora de Yucatán (zona IANA America/Merida),
// sin importar dónde corra el código.
export const TIME_ZONE = "America/Merida";

const longDate = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: TIME_ZONE });
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }); // YYYY-MM-DD

export function formatDate(iso: string | Date): string {
  return longDate.format(new Date(iso));
}

/** Día calendario (YYYY-MM-DD) en Yucatán. */
export function localDay(date: string | Date): string {
  return isoDay.format(new Date(date));
}

/** Días calendario completos entre dos fechas, según la hora de Yucatán. */
export function daysBetween(from: string | Date, to: string | Date = new Date()): number {
  const ms = Date.parse(localDay(to)) - Date.parse(localDay(from));
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function daysLabel(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "1 día";
  return `${days} días`;
}

/** "Reportado hace 5 días" / "Reportado hoy". */
export function agoLabel(days: number): string {
  return days === 0 ? "hoy" : `hace ${daysLabel(days)}`;
}
