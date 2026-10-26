"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { CATEGORY_KEYS, MAP_STYLE_URL, NEIGHBORHOOD, type LatLng } from "@/lib/config";
import { clipLinesToPolygon, distanceToLine, nearestPointOnLines, paddedBounds, type Line } from "@/lib/geo";
import { pinImageId, pinSvg } from "@/lib/pins";
import { blockAround, overlaps } from "@/lib/streets";
import type { Report } from "@/lib/types";
import { popupContent } from "./popup";
import type { UserLocation } from "./useUserLocation";

/** Funciones del mapa que usa el formulario. */
export type MapApi = {
  /** Busca la calle más cercana al punto y devuelve su trazo dentro de la colonia. */
  detectStreet: (point: LatLng) => { name: string | null; lines: Line[] } | null;
  /** Punto del mapa bajo el centro de la pantalla (donde está la mira). */
  /**
   * El punto sobre la calle más cercana (a lo más `maxMeters`), o null si no hay calle.
   * Si el mapa base no tiene calles cargadas, devuelve el mismo punto.
   */
  snapToStreet: (point: LatLng, maxMeters?: number) => LatLng | null;
  getCenter: () => LatLng;
  flyTo: (point: LatLng, zoom?: number) => void;
  getZoom: () => number;
  /** Centra un reporte en el mapa y abre su globo. */
  focusReport: (id: string) => void;
};

type Props = {
  reports: Report[];
  draft?: LatLng | null;
  /** Trazo de la calle que se está reportando. */
  draftPath?: Line[] | null;
  /** Encuadrar el trazo por encima del formulario. */
  focusPath?: boolean;
  apiRef?: RefObject<MapApi | null>;
  onPick?: (point: LatLng) => void;
  showStatus?: boolean;
  /** Solo para el admin: marcar como arreglado desde el globo. */
  onMarkFixed?: (id: string) => Promise<void>;
  /** Apoyar una iniciativa; devuelve el nuevo total. */
  onSupport?: (id: string) => Promise<number>;
  hasSupported?: (id: string) => boolean;
  /** Avisar que ya se arregló; devuelve el nuevo total. */
  onFixedVote?: (id: string) => Promise<number>;
  hasFixedVoted?: (id: string) => boolean;
  /** Espacio que tapan los paneles flotantes, para encuadrar la colonia. */
  padding?: { top: number; bottom: number; left: number; right: number };
  /** Punto azul con la ubicación del vecino, como en Google Maps. */
  userLocation?: UserLocation | null;
  /** Agrupar reportes cercanos en círculos con número (por omisión, sí). */
  cluster?: boolean;
};

const BRAND = "#0f766e";
const CLUSTER_OPTIONS = { clusterRadius: 48, clusterMaxZoom: 16 };

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

function toLines(reports: Report[]): GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  return {
    type: "FeatureCollection",
    features: reports
      .filter((r) => r.path)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "MultiLineString", coordinates: r.path! },
        properties: { id: r.id, resolved: r.status === "resuelto" },
      })),
  };
}

/** Trazo en edición: la línea y, si son pocos, sus vértices. */
/** Círculo de precisión de la ubicación, en metros, como polígono. */
function accuracyCircle(loc: UserLocation | null | undefined): GeoJSON.FeatureCollection {
  if (!loc) return { type: "FeatureCollection", features: [] };
  const steps = 48;
  const dLat = loc.accuracy / 111_320;
  const dLng = dLat / Math.cos((loc.lat * Math.PI) / 180);
  const coords = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [loc.lng + dLng * Math.cos(a), loc.lat + dLat * Math.sin(a)];
  });
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } }],
  };
}

function draftFeatures(lines: Line[] | null | undefined): GeoJSON.FeatureCollection {
  const coords = lines ?? [];
  const vertices = coords.flat();
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "MultiLineString", coordinates: coords }, properties: { kind: "line" } },
      ...(vertices.length <= 60
        ? [
            {
              type: "Feature" as const,
              geometry: { type: "MultiPoint" as const, coordinates: vertices },
              properties: { kind: "vertex" },
            },
          ]
        : []),
    ],
  };
}

// Clases de vía de OpenMapTiles que cuentan como cruce (no andadores ni accesos privados).
const CROSSING_CLASSES = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "busway"]);

const asLines = (g: GeoJSON.Geometry): Line[] =>
  g.type === "LineString" ? [g.coordinates as Line] : g.type === "MultiLineString" ? (g.coordinates as Line[]) : [];

/**
 * Cuadra de la calle tocada, según el mapa base (esquema OpenMapTiles): la calle
 * más cercana al punto, recortada entre los dos cruces más próximos.
 */
function findStreet(map: MapLibreMap, point: LatLng): { name: string | null; lines: Line[] } | null {
  const sources = Object.entries(map.getStyle().sources)
    .filter(([, s]) => s.type === "vector")
    .map(([id]) => id);

  type Road = { name: string | null; className: string; lines: Line[]; distance: number };
  const named: Road[] = [];
  const roads: Road[] = [];
  for (const source of sources) {
    for (const [sourceLayer, list] of [
      ["transportation_name", named],
      ["transportation", roads],
    ] as const) {
      for (const f of map.querySourceFeatures(source, { sourceLayer })) {
        const lines = asLines(f.geometry);
        if (lines.length === 0) continue;
        const distance = Math.min(...lines.map((l) => distanceToLine(point, l)));
        // Solo lo cercano: suficiente para encontrar los cruces de la cuadra.
        if (distance > 400) continue;
        list.push({
          name: (f.properties?.name as string | undefined) || null,
          className: String(f.properties?.class ?? ""),
          lines,
          distance,
        });
      }
    }
  }

  // La calle tocada: preferir la que tiene nombre, para unir sus tramos.
  const nearestNamed = named.filter((r) => r.name && r.distance <= 30).sort((a, b) => a.distance - b.distance)[0];
  const nearestRoad = roads.filter((r) => r.distance <= 30).sort((a, b) => a.distance - b.distance)[0];
  const target = nearestNamed ?? nearestRoad;
  if (!target) return null;

  const street = target.name ? named.filter((r) => r.name === target.name).flatMap((r) => r.lines) : target.lines;
  const others = [
    ...named.filter((r) => r.name !== target.name).flatMap((r) => r.lines),
    ...roads
      .filter((r) => r !== target && CROSSING_CLASSES.has(r.className.replace(/_construction$/, "")))
      .flatMap((r) => r.lines)
      .filter((l) => !overlaps(l, street)),
  ];

  const block = blockAround(point, street, others);
  const clipped = block ? clipLinesToPolygon([block], NEIGHBORHOOD.polygon) : [];
  return clipped.length ? { name: target.name, lines: clipped } : null;
}

/** Distancia máxima a una calle para aceptar un reporte puntual (aceras y frentes de casa). */
const STREET_SNAP_M = 20;
const NOT_STREET_CLASSES = new Set(["path", "rail", "transit", "ferry", "raceway"]);

function snapToStreet(map: MapLibreMap, point: LatLng, maxMeters = STREET_SNAP_M): LatLng | null {
  const sources = Object.entries(map.getStyle().sources)
    .filter(([, s]) => s.type === "vector")
    .map(([id]) => id);
  const lines = sources.flatMap((source) =>
    map
      .querySourceFeatures(source, { sourceLayer: "transportation" })
      // Andadores, vías de tren y ferris no cuentan como calle.
      .filter((f) => !NOT_STREET_CLASSES.has(String(f.properties?.class ?? "")))
      .flatMap((f) => asLines(f.geometry)),
  );
  if (lines.length === 0) return sources.length === 0 ? point : null;
  const nearest = nearestPointOnLines(point, lines);
  return nearest && nearest.distance <= maxMeters ? nearest.point : null;
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

export function ReportMap({
  reports,
  draft,
  draftPath,
  focusPath = false,
  apiRef,
  onPick,
  showStatus = false,
  onMarkFixed,
  onSupport,
  hasSupported,
  onFixedVote,
  hasFixedVoted,
  padding,
  userLocation,
  cluster = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const draftMarker = useRef<maplibregl.Marker | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Refs para que los manejadores de eventos vean siempre los valores actuales.
  const onPickRef = useRef(onPick);
  const reportsRef = useRef(reports);
  const clusterRef = useRef(cluster);
  const popupOptions = useRef({ showStatus, onMarkFixed, onSupport, hasSupported, onFixedVote, hasFixedVoted });
  useEffect(() => {
    onPickRef.current = onPick;
    reportsRef.current = reports;
    popupOptions.current = { showStatus, onMarkFixed, onSupport, hasSupported, onFixedVote, hasFixedVoted };
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

      map.addSource("street-lines", { type: "geojson", data: toLines(reportsRef.current) });
      map.addLayer({
        id: "street-lines-casing",
        type: "line",
        source: "street-lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#fff", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 4, 18, 12] },
      });
      map.addLayer({
        id: "street-lines",
        type: "line",
        source: "street-lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "resolved"], "#16a34a", "#78716c"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2.5, 18, 8],
          "line-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "street-selected",
        type: "line",
        source: "street-lines",
        filter: ["==", ["get", "id"], ""],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": BRAND, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 5, 18, 12] },
      });

      map.addSource("user-accuracy", { type: "geojson", data: accuracyCircle(null) });
      map.addLayer({
        id: "user-accuracy",
        type: "fill",
        source: "user-accuracy",
        paint: { "fill-color": "#1a73e8", "fill-opacity": 0.14, "fill-outline-color": "#1a73e8" },
      });

      map.addSource("draft-path", { type: "geojson", data: draftFeatures(null) });
      map.addLayer({
        id: "draft-path",
        type: "line",
        source: "draft-path",
        filter: ["==", ["get", "kind"], "line"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": BRAND, "line-width": 6, "line-dasharray": [1.5, 1] },
      });
      map.addLayer({
        id: "draft-path-points",
        type: "circle",
        source: "draft-path",
        filter: ["==", ["get", "kind"], "vertex"],
        paint: { "circle-radius": 4, "circle-color": "#fff", "circle-stroke-color": BRAND, "circle-stroke-width": 2 },
      });

      map.addSource("reports", {
        type: "geojson",
        data: toFeatures(reportsRef.current),
        cluster: clusterRef.current,
        ...CLUSTER_OPTIONS,
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

    const openPopup = (id: string, at: [number, number], offset: [number, number]) => {
      const report = reportsRef.current.find((r) => r.id === id);
      if (!report) return;
      const popup = new maplibregl.Popup({ offset, maxWidth: "300px", closeButton: false });
      // Resaltar el trazo de la calle mientras su globo está abierto.
      if (report.path) {
        map.setFilter("street-selected", ["==", ["get", "id"], report.id]);
        popup.on("close", () => map.setFilter("street-selected", ["==", ["get", "id"], ""]));
      }
      const { showStatus, onMarkFixed, onSupport, hasSupported, onFixedVote, hasFixedVoted } = popupOptions.current;
      const markFixed =
        onMarkFixed &&
        (async (reportId: string) => {
          await onMarkFixed(reportId);
          popup.remove();
        });
      popup
        .setLngLat(at)
        .setDOMContent(
          popupContent(report, {
            showStatus,
            onMarkFixed: markFixed,
            onSupport,
            supported: hasSupported?.(report.id) ?? false,
            onFixedVote,
            fixedVoted: hasFixedVoted?.(report.id) ?? false,
          }),
        )
        .addTo(map);
    };

    map.on("click", "pins", (e) => {
      if (onPickRef.current) return;
      const feature = e.features?.[0];
      if (feature?.geometry.type === "Point") {
        openPopup(feature.properties.id, feature.geometry.coordinates as [number, number], [0, -46]);
      }
    });
    map.on("click", "street-lines", (e) => {
      if (onPickRef.current) return;
      // Si el clic también cae en un pin, ese ya abrió su globo.
      if (map.queryRenderedFeatures(e.point, { layers: ["pins", "clusters"] }).length) return;
      const id = e.features?.[0]?.properties.id;
      if (id) openPopup(id, [e.lngLat.lng, e.lngLat.lat], [0, -8]);
    });

    /** Centra un reporte (su pin o toda su calle) y abre su globo. */
    const focusReport = (id: string) => {
      const report = reportsRef.current.find((r) => r.id === id);
      if (!report) return;
      document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());
      // Dejar el reporte en la parte baja del mapa para que el globo quepa arriba.
      const room = map.getContainer().clientHeight * 0.28;
      const points = report.path?.flat() ?? [];
      if (points.length >= 2) {
        const lngs = points.map((p) => p[0]);
        const lats = points.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: { top: 60 + room, bottom: 40, left: 40, right: 40 }, maxZoom: 18, duration: 700 },
        );
        openPopup(id, [report.lng, report.lat], [0, -46]);
      } else {
        map.flyTo({ center: [report.lng, report.lat], offset: [0, room], zoom: Math.max(map.getZoom(), 18), duration: 700 });
        openPopup(id, [report.lng, report.lat], [0, -46]);
      }
    };

    if (apiRef) {
      apiRef.current = {
        detectStreet: (point) => findStreet(map, point),
        snapToStreet: (point, maxMeters) => snapToStreet(map, point, maxMeters),
        getCenter: () => {
          const c = map.getCenter();
          return [c.lat, c.lng];
        },
        flyTo: (point, zoom = 18) => map.flyTo({ center: toLngLat(point), zoom, duration: 800 }),
        getZoom: () => map.getZoom(),
        focusReport,
      };
    }

    map.on("click", (e) => onPickRef.current?.([e.lngLat.lat, e.lngLat.lng]));

    for (const layer of ["clusters", "pins", "street-lines"]) {
      map.on("mouseenter", layer, () => {
        if (!onPickRef.current) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      if (apiRef) apiRef.current = null;
      userMarker.current?.remove();
      draftMarker.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // El mapa se crea una vez; los cambios de props se aplican en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agrupar o mostrar cada marcador por separado.
  useEffect(() => {
    clusterRef.current = cluster;
    if (!ready) return;
    mapRef.current?.getSource<GeoJSONSource>("reports")?.setClusterOptions({ cluster, ...CLUSTER_OPTIONS });
  }, [ready, cluster]);

  // Actualizar los reportes visibles.
  useEffect(() => {
    if (!ready) return;
    mapRef.current?.getSource<GeoJSONSource>("reports")?.setData(toFeatures(reports));
    mapRef.current?.getSource<GeoJSONSource>("street-lines")?.setData(toLines(reports));
  }, [ready, reports]);

  // Trazo de la calle en edición.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map?.getSource<GeoJSONSource>("draft-path")?.setData(draftFeatures(draftPath));
    const points = draftPath?.flat() ?? [];
    if (map && focusPath && points.length >= 2) {
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      // Mostrar toda la calle en el espacio que deja libre el formulario.
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: { top: 150, bottom: window.innerHeight * 0.6 + 24, left: 40, right: 40 }, maxZoom: 18, duration: 500 },
      );
    }
  }, [ready, draftPath, focusPath]);

  // Punto azul de "estás aquí".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (ready) map.getSource<GeoJSONSource>("user-accuracy")?.setData(accuracyCircle(userLocation));
    if (!userLocation) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.className = "user-dot";
      el.setAttribute("aria-label", "Tu ubicación");
      el.innerHTML = '<span class="user-dot__cone"></span><span class="user-dot__point"></span>';
      userMarker.current = new maplibregl.Marker({ element: el });
    }
    userMarker.current.setLngLat([userLocation.lng, userLocation.lat]);
    if (!userMarker.current.getElement().isConnected) userMarker.current.addTo(map);
    const el = userMarker.current.getElement();
    el.classList.toggle("user-dot--heading", userLocation.heading !== null);
    if (userLocation.heading !== null) el.style.setProperty("--heading", `${userLocation.heading}deg`);
  }, [ready, userLocation]);

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

