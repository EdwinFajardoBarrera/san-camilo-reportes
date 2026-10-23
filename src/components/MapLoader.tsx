"use client";

import dynamic from "next/dynamic";

// Leaflet usa `window`, así que el mapa solo se renderiza en el navegador.
export const ReportMap = dynamic(() => import("./ReportMap").then((m) => m.ReportMap), {
  ssr: false,
  loading: () => <div className="map-loading">Cargando mapa…</div>,
});
