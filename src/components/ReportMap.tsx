"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_KEYS, MAP_STYLE_URL, NEIGHBORHOOD, type LatLng } from "@/lib/config";
import { paddedBounds } from "@/lib/geo";
import { pinImageId, pinSvg } from "@/lib/pins";
import type { Report } from "@/lib/types";
import { popupContent } from "./popup";

type Props = {
  reports: Report[];
  draft?: LatLng | null;
  onPick?: (point: LatLng) => void;
  showStatus?: boolean;
  /** Solo para el admin: marcar como arreglado desde el globo. */
  onMarkFixed?: (id: string) => Promise<void>;
  /** Espacio que tapan los paneles flotantes, para encuadrar la colonia. */
  padding?: { top: number; bottom: number; left: number; right: number };
};

const BRAND = "#0f766e";

// MapLibre trabaja en [lng, lat]; la configuración está en [lat, lng].
const toLngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];
const ring = [...NEIGHBORHOOD.polygon, NEIGHBORHOOD.polygon[0]].map(toLngLat);
const boundsOf = ([[s, w], [n, e]]: [LatLng, LatLng]): LngLatBoundsLike => [
  [w, s],
  [e, n],
];

/** Todo el mundo menos la colonia, para atenuar lo que queda fuera. */
const outsideMask: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-180, -85],
        [180, -85],
        [180, 85],
        [-180, 85],
        [-180, -85],
      ],
      ring,
    ],
  },
};

function toFeatures(reports: Report[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: reports.map((r) => ({
      type: "Feature",
      id: r.id,
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        category: r.category,
        status: r.status,
        icon: pinImageId(r.category, r.status === "resuelto"),
      },
    })),
  };
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function addPinImages(map: MapLibreMap) {
  const variants = CATEGORY_KEYS.flatMap((c) => [false, true].map((resolved) => [c, resolved] as const));
  await Promise.all(
    variants.map(async ([category, resolved]) => {
      const id = pinImageId(category, resolved);
      if (!map.hasImage(id)) map.addImage(id, await loadImage(pinSvg(category, resolved)), { pixelRatio: 2 });
    }),
  );
}

export function ReportMap({ reports, draft, onPick, showStatus = false, onMarkFixed, padding }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const draftMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Refs para que los manejadores de eventos vean siempre los valores actuales.
  const onPickRef = useRef(onPick);
  const reportsRef = useRef(reports);
  const popupOptions = useRef({ showStatus, onMarkFixed });
  useEffect(() => {
    onPickRef.current = onPick;
    reportsRef.current = reports;
    popupOptions.current = { showStatus, onMarkFixed };
  });

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!container.current) return;
    const pad = padding ?? { top: 40, bottom: 40, left: 40, right: 40 };
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE_URL,
      bounds: boundsOf(paddedBounds(NEIGHBORHOOD.polygon, 0)),
      fitBoundsOptions: { padding: pad },
      maxBounds: boundsOf(paddedBounds(NEIGHBORHOOD.polygon, NEIGHBORHOOD.panMargin)),
      minZoom: NEIGHBORHOOD.minZoom,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    map.on("load", async () => {
      await addPinImages(map);

      map.addSource("outside", { type: "geojson", data: outsideMask });
      map.addLayer({
        id: "outside",
        type: "fill",
        source: "outside",
        paint: { "fill-color": "#1e293b", "fill-opacity": 0.14 },
      });
      map.addLayer({
        id: "colonia-border",
        type: "line",
        source: "outside",
        paint: { "line-color": BRAND, "line-width": 2.5, "line-opacity": 0.8 },
      });

      map.addSource("reports", {
        type: "geojson",
        data: toFeatures(reportsRef.current),
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 16,
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "reports",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": BRAND,
          "circle-radius": ["step", ["get", "point_count"], 17, 10, 21, 30, 26],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "reports",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 14,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#fff" },
      });
      map.addLayer({
        id: "pins",
        type: "symbol",
        source: "reports",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "symbol-z-order": "viewport-y",
        },
      });

      setReady(true);
    });

    map.on("click", "clusters", async (e) => {
      if (onPickRef.current) return;
      const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature || feature.geometry.type !== "Point") return;
      const source = map.getSource<GeoJSONSource>("reports");
      const zoom = await source?.getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: (zoom ?? map.getZoom()) + 0.5 });
    });

    map.on("click", "pins", (e) => {
      if (onPickRef.current) return;
      const feature = e.features?.[0];
      const report = reportsRef.current.find((r) => r.id === feature?.properties.id);
      if (!report) return;
      const popup = new maplibregl.Popup({ offset: [0, -46], maxWidth: "300px", closeButton: false });
      const { showStatus, onMarkFixed } = popupOptions.current;
      const markFixed = onMarkFixed && (async (id: string) => {
        await onMarkFixed(id);
        popup.remove();
      });
      popup
        .setLngLat([report.lng, report.lat])
        .setDOMContent(popupContent(report, { showStatus, onMarkFixed: markFixed }))
        .addTo(map);
    });

    map.on("click", (e) => onPickRef.current?.([e.lngLat.lat, e.lngLat.lng]));

    for (const layer of ["clusters", "pins"]) {
      map.on("mouseenter", layer, () => {
        if (!onPickRef.current) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // El mapa se crea una vez; los cambios de props se aplican en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualizar los reportes visibles.
  useEffect(() => {
    if (!ready) return;
    mapRef.current?.getSource<GeoJSONSource>("reports")?.setData(toFeatures(reports));
  }, [ready, reports]);

  // Pin del reporte que se está creando.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draft) {
      draftMarker.current?.remove();
      draftMarker.current = null;
      return;
    }
    if (!draftMarker.current) {
      const el = document.createElement("div");
      el.className = "draft-pin";
      draftMarker.current = new maplibregl.Marker({ element: el, anchor: "bottom" });
    }
    draftMarker.current.setLngLat(toLngLat(draft)).addTo(map);
    // Dejar el punto visible por encima del formulario.
    map.easeTo({ center: toLngLat(draft), offset: [0, -window.innerHeight * 0.22], duration: 400 });
  }, [draft]);

  // Al cerrar popups cuando se entra en modo de selección.
  useEffect(() => {
    if (onPick) document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());
  }, [onPick]);

  return (
    <div className="map-frame">
      <div ref={container} className={`map${onPick ? " map--picking" : ""}`} />
    </div>
  );
}

