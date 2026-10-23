import type { MetadataRoute } from "next";
import { NEIGHBORHOOD } from "@/lib/config";

/** Permite "Agregar a la pantalla principal" en Android como si fuera una app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `Reportes ${NEIGHBORHOOD.name}`,
    short_name: `Reportes ${NEIGHBORHOOD.name}`,
    description: `Reporta baches, alumbrado, inundaciones y calles sin pavimentar en ${NEIGHBORHOOD.name}, ${NEIGHBORHOOD.city}.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    lang: "es-MX",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
