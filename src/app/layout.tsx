import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cirenaica Night Hunt",
  description: "Caccia notturna di Halloween nel quartiere Cirenaica, Bologna.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Night Hunt" },
  icons: { icon: "/icon.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// System fonts on purpose: SF Pro on iPhone and Mac, Roboto on Android.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
