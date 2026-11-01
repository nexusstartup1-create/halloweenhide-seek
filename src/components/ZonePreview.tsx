"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** A ring of lng/lat points approximating a circle of radiusM around a centre. */
function circle(lat: number, lng: number, radiusM: number): [number, number][] {
  const out: [number, number][] = [];
  const kx = 111320 * Math.cos((lat * Math.PI) / 180) || 1, ky = 110540;
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    out.push([lng + (Math.cos(a) * radiusM) / kx, lat + (Math.sin(a) * radiusM) / ky]);
  }
  return out;
}

/**
 * A small preview map for building a custom zone: shows the circle (centre + radius)
 * and lets the host tap to move the centre. Lightweight — no 3D, no GPS, just a basemap.
 */
export function ZonePreview({ center, radiusM, onPick }: { center: { lat: number; lng: number } | null; radiusM: number; onPick: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        if (cancelled || !el.current || map.current) return;
        const start = center ?? { lat: 44.4939, lng: 11.3431 }; // Bologna, until a centre is chosen
        const m = new ml.Map({
          container: el.current, style: STYLE, center: [start.lng, start.lat], zoom: 13,
          attributionControl: false, dragRotate: false, pitchWithRotate: false,
        });
        map.current = m;
        m.on("click", (e) => onPickRef.current(e.lngLat.lat, e.lngLat.lng));
        m.on("load", () => {
          m.addSource("zone", { type: "geojson", data: EMPTY });
          m.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#8cf25a", "fill-opacity": 0.14 } });
          m.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#8cf25a", "line-width": 2 } });
          if (!cancelled) setReady(true);
        });
      } catch {
        // map unavailable: the rest of the form still works
      }
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // Redraw the circle and reframe whenever the centre or radius changes.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const src = m.getSource("zone") as GeoJSONSource | undefined;
    if (!src) return;
    if (!center) { src.setData(EMPTY); return; }
    const ring = circle(center.lat, center.lng, radiusM);
    src.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] });
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 26, duration: 350, maxZoom: 16 });
  }, [ready, center?.lat, center?.lng, radiusM]);

  return (
    <div className="zonemap-wrap">
      <div ref={el} className="zonemap" />
      <span className="zonemap-hint">Tocca la mappa per spostare il centro</span>
    </div>
  );
}
