"use client";

import { useEffect, useState } from "react";

const EXPAND_KEY = "sc-expandir-marcadores";

/**
 * Ver cada marcador por separado en lugar de los círculos con número.
 * Solo se activa si `enabled`; la elección se recuerda en este navegador.
 */
export function useExpandedPins(enabled: boolean) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      if (enabled && localStorage.getItem(EXPAND_KEY) === "1") setExpanded(true);
    } catch {
      // Sin almacenamiento local: empieza agrupado.
    }
  }, [enabled]);

  function toggle() {
    setExpanded((prev) => {
      try {
        localStorage.setItem(EXPAND_KEY, prev ? "0" : "1");
      } catch {
        // Sin almacenamiento local: solo no lo recordamos.
      }
      return !prev;
    });
  }

  return { expanded: enabled && expanded, toggle };
}

/** Botón redondo para el mapa que alterna entre agrupar y ver todos los marcadores. */
export function ExpandPinsButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const label = expanded ? "Agrupar marcadores" : "Ver todos los marcadores";
  return (
    <button
      type="button"
      className="map-btn expand-pins"
      aria-label={label}
      title={label}
      aria-pressed={expanded}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M7 2a4 4 0 0 0-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 0 0-4-4zm0 5.5A1.5 1.5 0 1 1 7 4.5a1.5 1.5 0 0 1 0 3zM17 2a4 4 0 0 0-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 0 0-4-4zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM12 10a4 4 0 0 0-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 0 0-4-4zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
        />
      </svg>
    </button>
  );
}
