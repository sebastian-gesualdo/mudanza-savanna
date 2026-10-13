import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Casa de los Gesualdo",
  description: "Nuestras cajas, muebles y nuestra mudanza a Savanna.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Los Gesualdo",
    statusBarStyle: "default",
  },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fffdf8",
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
