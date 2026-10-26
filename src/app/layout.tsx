import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { SourceEgg } from "@/components/SourceEgg";
import { REPO_URL } from "@/lib/repo";

// Shows up at the top of "Visualizza sorgente pagina" for anyone who peeks.
const SOURCE_NOTE = `
  🧞  Genio della lampada, eh? Vuoi vedere il codice sorgente di Night Hunt?
      È tutto qui, open source: ${REPO_URL}
`;

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
      <body>
        <div style={{ display: "none" }} aria-hidden dangerouslySetInnerHTML={{ __html: `<!--${SOURCE_NOTE}-->` }} />
        <SourceEgg />
        {children}
      </body>
    </html>
  );
}
