"use client";

/** Botón redondo del mapa para mostrar y centrar el punto azul de «estás aquí». */
export function LocateButton({ active, disabled, onClick }: { active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="map-btn locate-me"
      aria-label="Mostrar mi ubicación"
      title="Mostrar mi ubicación"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"
        />
      </svg>
    </button>
  );
}
