import type { Metadata, Viewport } from "next";
import { NEIGHBORHOOD } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: `Reportes ${NEIGHBORHOOD.name}`,
  description: `Mapa colaborativo de baches, alumbrado, inundaciones y calles sin pavimentar en la colonia ${NEIGHBORHOOD.name}, ${NEIGHBORHOOD.city}.`,
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
  // En Android el teclado encoge la página, así el botón de enviar queda visible.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
