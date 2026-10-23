"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer, useMapEvents } from "react-leaflet";
import { CATEGORIES, NEIGHBORHOOD, STATUS_LABELS, type LatLng } from "@/lib/config";
import { paddedBounds } from "@/lib/geo";
import type { Report } from "@/lib/types";

type Props = {
  reports: Report[];
  draft?: LatLng | null;
  onPick?: (point: LatLng) => void;
  showStatus?: boolean;
};

const bounds = paddedBounds(NEIGHBORHOOD.polygon);
const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function ClickHandler({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export function ReportMap({ reports, draft, onPick, showStatus = false }: Props) {
  return (
    <MapContainer
      bounds={paddedBounds(NEIGHBORHOOD.polygon, 0.05)}
      maxBounds={bounds}
      maxBoundsViscosity={0.8}
      minZoom={NEIGHBORHOOD.minZoom}
      className={`map${onPick ? " map--picking" : ""}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Polygon
        positions={NEIGHBORHOOD.polygon}
        pathOptions={{ color: "#0f766e", weight: 2, fillOpacity: 0.06 }}
        interactive={false}
      />

      {reports.map((r) => {
        const cat = CATEGORIES[r.category];
        const resolved = r.status === "resuelto";
        return (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lng]}
            radius={9}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: resolved ? "#16a34a" : cat.color,
              fillOpacity: resolved ? 0.55 : 0.95,
            }}
          >
            <Popup>
              <div className="popup">
                <strong>
                  {cat.icon} {cat.label}
                </strong>
                {(resolved || showStatus) && <span className={`badge badge--${r.status}`}>{STATUS_LABELS[r.status]}</span>}
                {r.reference && <p className="popup__ref">{r.reference}</p>}
                {r.description && <p>{r.description}</p>}
                <small>Reportado el {dateFormat.format(new Date(r.createdAt))}</small>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {draft && (
        <CircleMarker
          center={draft}
          radius={12}
          pathOptions={{ color: "#0f766e", weight: 3, fillColor: "#fff", fillOpacity: 0.9, dashArray: "4 3" }}
        />
      )}
      {onPick && <ClickHandler onPick={onPick} />}
    </MapContainer>
  );
}
