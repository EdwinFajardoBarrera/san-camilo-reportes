"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UserLocation = {
  lat: number;
  lng: number;
  /** Radio de precisión en metros. */
  accuracy: number;
  /** Hacia dónde apunta el celular, en grados desde el norte; null si no se sabe. */
  heading: number | null;
};

type Status = "off" | "searching" | "on" | "denied" | "unavailable";

/** Orientación de la brújula: Android da `deviceorientationabsolute`; Safari, `webkitCompassHeading`. */
function compassHeading(e: DeviceOrientationEvent): number | null {
  const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof webkit === "number") return webkit;
  if (e.absolute && typeof e.alpha === "number") return (360 - e.alpha) % 360;
  return null;
}

/**
 * Sigue la ubicación del vecino como Google Maps. Si ya dio permiso antes, empieza
 * sola al abrir la página; si no, solo cuando se llama a `start` (sin pedir permiso de golpe).
 */
export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const watchId = useRef<number | null>(null);
  const compass = useRef<number | null>(null);

  const start = useCallback((): Promise<UserLocation | null> => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let first = true;
      const done = (value: UserLocation | null) => {
        if (first) resolve(value);
        first = false;
      };
      if (watchId.current === null) setStatus("searching");
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          const next: UserLocation = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            // Al caminar el GPS da el rumbo; quieto, usamos la brújula.
            heading: coords.speed && coords.speed > 0.5 && coords.heading !== null ? coords.heading : compass.current,
          };
          setLocation(next);
          setStatus("on");
          done(next);
        },
        (err) => {
          setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
          if (err.code === err.PERMISSION_DENIED) setLocation(null);
          done(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
      );
    });
  }, []);

  // Empezar solo si el permiso ya estaba concedido.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") void start();
      })
      .catch(() => {});
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [start]);

  // Brújula mientras se muestra la ubicación.
  const showing = status === "on";
  useEffect(() => {
    if (!showing) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const heading = compassHeading(e);
      if (heading === null) return;
      compass.current = heading;
      setLocation((loc) => (loc && (loc.heading === null || Math.abs(loc.heading - heading) > 4) ? { ...loc, heading } : loc));
    };
    const event = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(event, onOrientation as EventListener);
    return () => window.removeEventListener(event, onOrientation as EventListener);
  }, [showing]);

  return { location, status, start };
}
