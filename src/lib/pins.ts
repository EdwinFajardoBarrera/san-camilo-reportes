import { CATEGORIES, type Category } from "./config";

// Íconos blancos de 24×24 para el interior de cada pin.
const ICONS: Record<Category, string> = {
  bache:
    '<ellipse cx="12" cy="13" rx="7.5" ry="4.2" fill="none" stroke="#fff" stroke-width="2"/>' +
    '<ellipse cx="12" cy="13.4" rx="3.6" ry="1.9" fill="#fff"/>',
  alumbrado:
    '<path fill="#fff" d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2v.4h5.2v-.4c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>' +
    '<path fill="#fff" d="M9.4 17.6h5.2v1.2a1.6 1.6 0 0 1-1.6 1.6h-2a1.6 1.6 0 0 1-1.6-1.6z"/>',
  inundacion:
    '<path fill="#fff" d="M12 3.2s-4.6 5.1-4.6 8.4a4.6 4.6 0 0 0 9.2 0c0-3.3-4.6-8.4-4.6-8.4z"/>' +
    '<path fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" d="M4 19.2c1.3 0 1.3-1 2.7-1s1.3 1 2.6 1 1.4-1 2.7-1 1.3 1 2.7 1 1.3-1 2.6-1 1.4 1 2.7 1"/>',
  sin_pavimentar:
    '<path fill="#fff" d="M10.6 3.5h2.8l1 3.6H9.6zM9.1 9h5.8l1 3.6H8.1zM7.6 14.5h8.8l1.1 3.7H6.5z"/>' +
    '<rect x="4.5" y="18.8" width="15" height="1.9" rx=".9" fill="#fff"/>',
};

const RESOLVED_COLOR = "#16a34a";

/** SVG de un pin tipo gota con el ícono de la categoría (40×52 lógicos). */
export function pinSvg(category: Category, resolved = false, scale = 2): string {
  const color = resolved ? RESOLVED_COLOR : CATEGORIES[category].color;
  const w = 40 * scale;
  const h = 52 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 40 52">
  <defs><filter id="s" x="-30%" y="-20%" width="160%" height="150%">
    <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000" flood-opacity=".35"/>
  </filter></defs>
  <path filter="url(#s)" fill="${color}" stroke="#fff" stroke-width="2.5"
    d="M20 49.5S5 33.2 5 20a15 15 0 0 1 30 0c0 13.2-15 29.5-15 29.5z"/>
  <g transform="translate(8 8)">${ICONS[category]}</g>
</svg>`;
}

export function pinImageId(category: Category, resolved: boolean): string {
  return `pin-${category}${resolved ? "-ok" : ""}`;
}
