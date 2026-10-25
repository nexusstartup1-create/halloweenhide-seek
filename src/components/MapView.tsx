"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import { liteGraphics, markLiteGraphics } from "./device";
import { Glyph } from "./Icons";
import type { Fix, LngLat } from "./types";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const FONT = ["Open Sans Bold"];

export interface MapPoint { id: string; lat: number; lng: number; kind: "me" | "partner" | "hunter" | "fugitive" | "captured"; label?: string; fixAt?: string | null }
export interface MapZone { lat: number; lng: number; radiusM: number; ageS: number }
export interface MapQuest {
  id: string; lat: number; lng: number; title: string; points: number; done: boolean;
  radiusM?: number; flash?: boolean; reward?: "ZOMBIE" | "GHOST_SHIELD" | "ECO" | null; abandoned?: boolean; treasure?: boolean;
}

interface Props {
  boundary: LngLat[];
  /** The boundary while it shrinks (drawn in red, the original fades). */
  liveBoundary?: LngLat[] | null;
  fix?: Fix | null;
  points?: MapPoint[];
  quests?: MapQuest[];
  zones?: MapZone[];
  sectorCounts?: Record<string, number>;
  tracked?: string | null;
  /** Which character you are on the 3D map. */
  meLook?: import("./map3d").Look;
  /** Fly the camera here (from the legend). `n` changes on every request. */
  focus?: { lng: number; lat: number; zoom: number; n: number } | null;
  onMapClick?: (lng: number, lat: number) => void;
}

function sectorFeatures(poly: LngLat[], counts: Record<string, number>, tracked: string | null) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX) / 3, h = (maxY - minY) / 3;
  const polys = [], labels = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const id = `C${r * 3 + c + 1}`;
      const x0 = minX + c * w, y1 = maxY - r * h;
      const pinged = id in counts;
      const props = { id, pinged, tracked: id === tracked, label: pinged ? `${id} · ${counts[id]}` : id, hot: pinged && counts[id] > 0 };
      polys.push({ type: "Feature" as const, properties: props, geometry: { type: "Polygon" as const, coordinates: [[[x0, y1], [x0 + w, y1], [x0 + w, y1 - h], [x0, y1 - h], [x0, y1]]] } });
      labels.push({ type: "Feature" as const, properties: props, geometry: { type: "Point" as const, coordinates: [x0 + w / 2, y1 - h / 2] } });
    }
  return { polys: { type: "FeatureCollection" as const, features: polys }, labels: { type: "FeatureCollection" as const, features: labels } };
}

/** Centre of sector C1..C9 (3×3 grid over the zone's bounding box). */
export function sectorCenter(poly: LngLat[], id: string): [number, number] | null {
  const n = Number(id.slice(1)) - 1;
  if (!(n >= 0 && n < 9)) return null;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const r = Math.floor(n / 3), c = n % 3;
  return [minX + ((c + 0.5) * (maxX - minX)) / 3, maxY - ((r + 0.5) * (maxY - minY)) / 3];
}

function hatchImage() {
  const size = 12;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#E50914";
  g.lineWidth = 2.5;
  g.beginPath();
  for (let i = -size; i <= size * 2; i += 6) {
    g.moveTo(i, 0);
    g.lineTo(i + size, size);
  }
  g.stroke();
  return g.getImageData(0, 0, size, size);
}

function circle(lat: number, lng: number, radiusM: number): [number, number][] {
  const out: [number, number][] = [];
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    out.push([lng + (Math.cos(a) * radiusM) / kx, lat + (Math.sin(a) * radiusM) / ky]);
  }
  return out;
}

export default function MapView({ boundary, liveBoundary = null, fix, points = [], quests = [], zones = [], sectorCounts = {}, tracked = null, meLook = "fugitive", focus = null, onMapClick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const followed = useRef(false);
  const fx = useRef<import("./map3d").Map3D | null>(null);
  const [fxReady, setFxReady] = useState(false);
  // Bumped when Safari kills the map's graphics (too much memory on an old phone): rebuilt in light mode.
  const [gen, setGen] = useState(0);
  const [recovered, setRecovered] = useState(false);
  const clickRef = useRef(onMapClick);
  useEffect(() => { clickRef.current = onMapClick; }, [onMapClick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        // The bundler can't resolve MapLibre's module worker; serve it from /public (see package.json copy:maplibre).
        ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        if (cancelled || !el.current) return;
        const xs = boundary.map((p) => p[0]), ys = boundary.map((p) => p[1]);
        const lite = liteGraphics();
        const m = new ml.Map({
          // Light mode: fewer pixels to draw and keep in memory.
          pixelRatio: lite ? Math.min(window.devicePixelRatio || 1, 1.5) : undefined,
          container: el.current,
          style: STYLE,
          bounds: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
          fitBoundsOptions: { padding: 24 },
          // Tilted so the 3D beacons stand up out of the map.
          pitch: 40,
          maxPitch: 60,
          attributionControl: { compact: true },
          pitchWithRotate: false,
          dragRotate: false,
        });
        m.touchZoomRotate.disableRotation();
        m.getCanvas().addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          if (cancelled) return;
          markLiteGraphics();
          setRecovered(true);
          setGen((n) => n + 1);
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.on("click", (e: { lngLat: { lng: number; lat: number } }) => clickRef.current?.(e.lngLat.lng, e.lngLat.lat));
        m.on("load", () => {
          m.addImage("hatch", hatchImage(), { pixelRatio: 2 });
          const empty = { type: "FeatureCollection" as const, features: [] };
          for (const id of ["sectors", "sectorLabels", "boundary", "liveBoundary", "zones", "quests", "people"]) m.addSource(id, { type: "geojson", data: empty });
          m.addLayer({ id: "sector-hatch", type: "fill", source: "sectors", filter: ["get", "hot"], paint: { "fill-pattern": "hatch", "fill-opacity": 0.8 } });
          m.addLayer({ id: "sector-line", type: "line", source: "sectors", paint: { "line-color": "#4A4440", "line-width": 1, "line-dasharray": [3, 3] } });
          m.addLayer({ id: "sector-ping", type: "line", source: "sectors", filter: ["get", "pinged"], paint: { "line-color": "#E50914", "line-width": 2 } });
          m.addLayer({ id: "sector-track", type: "line", source: "sectors", filter: ["get", "tracked"], paint: { "line-color": "#FFFFFF", "line-width": 3 } });
          m.addLayer({
            id: "sector-label", type: "symbol", source: "sectorLabels",
            layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": ["case", ["get", "pinged"], 18, 12], "text-allow-overlap": true },
            paint: { "text-color": ["case", ["get", "hot"], "#FFFFFF", ["get", "pinged"], "#E50914", "#9A938C"], "text-halo-color": "#0B0B0C", "text-halo-width": 2 },
          });
          m.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": "#a970ff", "line-width": 3 } });
          // Battle royale: the shrinking line, pulsing red over a faded original.
          m.addLayer({ id: "live-boundary-glow", type: "line", source: "liveBoundary", paint: { "line-color": "#ff2040", "line-width": 10, "line-opacity": 0.25, "line-blur": 6 } });
          m.addLayer({ id: "live-boundary-line", type: "line", source: "liveBoundary", paint: { "line-color": "#ff3a50", "line-width": 3 } });
          // Fugitive zones (hunters only): a blurred circle, fainter when the GPS fix is old.
          m.addLayer({
            id: "zone-fill", type: "fill", source: "zones",
            paint: { "fill-color": "#E50914", "fill-opacity": 0 },
          });
          m.addLayer({
            id: "zone-line", type: "line", source: "zones",
            paint: { "line-color": "#FF4D55", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": ["case", ["get", "stale"], 0.4, 0.9] },
          });
          m.addLayer({
            id: "quest-dot", type: "circle", source: "quests",
            // Drawn in 3D (map3d.ts); this invisible dot only catches taps.
            paint: { "circle-radius": 18, "circle-color": "#FF6600", "circle-opacity": 0.01, "circle-stroke-width": 0 },
          });
          m.addLayer({
            id: "people-dot", type: "circle", source: "people",
            filter: ["!", ["in", ["get", "kind"], ["literal", ["me", "partner"]]]],
            paint: {
              "circle-radius": ["match", ["get", "kind"], "me", 8, 7],
              "circle-color": ["match", ["get", "kind"], "me", "#FFFFFF", "fugitive", "#FF6600", "hunter", "#FFFFFF", "captured", "#E50914", "#0B0B0C"],
              "circle-stroke-color": ["match", ["get", "kind"], "me", "#0B0B0C", "partner", "#FFFFFF", "#0B0B0C"],
              "circle-stroke-width": ["match", ["get", "kind"], "partner", 3, 2],
            },
          });
          m.addLayer({
            id: "people-label", type: "symbol", source: "people",
            layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true },
            paint: { "text-color": "#FFFFFF", "text-halo-color": "#0B0B0C", "text-halo-width": 2 },
          });
          // Mission names only on tap: in the centre they would overlap.
          const popup = new ml.Popup({ closeButton: false, offset: 14, className: "mpop" });
          m.on("click", "quest-dot", (e) => {
            const f = e.features?.[0];
            if (!f || f.geometry.type !== "Point") return;
            const p = f.properties as { title: string; points: number; done: boolean };
            const el = document.createElement("div");
            const t = document.createElement("b");
            t.textContent = p.title;
            const sub = document.createElement("span");
            sub.textContent = String(p.done) === "true" ? "Fatta" : `+${Number(p.points).toLocaleString("it-IT")} punti`;
            el.append(t, sub);
            popup.setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(el).addTo(m);
          });
          m.on("mouseenter", "quest-dot", () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", "quest-dot", () => (m.getCanvas().style.cursor = ""));
          setReady(true);
          // 3D beacons and auras. If WebGL/three.js fails, fall back to the flat dots.
          import("./map3d")
            .then(({ Map3D }) => {
              if (cancelled) return;
              const f = new Map3D(m, ml, [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], lite);
              m.addLayer(f.layer, "people-label");
              fx.current = f;
              setFxReady(true);
            })
            .catch(() => {
              m.setPaintProperty("quest-dot", "circle-opacity", 1);
              m.setPaintProperty("quest-dot", "circle-radius", 10);
              m.setPaintProperty("zone-fill", "fill-opacity", 0.2);
              m.setFilter("people-dot", null);
            });
        });
        m.on("error", (e) => console.warn("map:", e.error?.message));
        map.current = m;
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      fx.current = null;
      map.current?.remove();
      map.current = null;
      setReady(false);
      setFxReady(false);
    };
    // The map is created once (again only after a graphics crash); data updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const set = (id: string, data: GeoJSON.GeoJSON) => (m.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    const s = sectorFeatures(boundary, sectorCounts, tracked);
    set("sectors", s.polys);
    set("sectorLabels", s.labels);
    set("boundary", { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...boundary, boundary[0]] } });
    set("liveBoundary", liveBoundary
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...liveBoundary, liveBoundary[0]] } }
      : { type: "FeatureCollection", features: [] });
    m.setPaintProperty("boundary-line", "line-opacity", liveBoundary ? 0.3 : 1);
    m.setPaintProperty("boundary-line", "line-dasharray", liveBoundary ? [2, 2] : [1, 0]);
    set("quests", {
      type: "FeatureCollection",
      features: quests.map((q) => ({ type: "Feature", properties: { done: q.done, title: q.title, points: q.points }, geometry: { type: "Point", coordinates: [q.lng, q.lat] } })),
    });
    set("zones", {
      type: "FeatureCollection",
      features: zones.map((z) => ({ type: "Feature", properties: { stale: z.ageS > 180 }, geometry: { type: "Polygon", coordinates: [circle(z.lat, z.lng, z.radiusM)] } })),
    });
    const people = [...points];
    if (fix) people.push({ id: "me", lat: fix.lat, lng: fix.lng, kind: "me", label: "TU" });
    set("people", {
      type: "FeatureCollection",
      features: people.map((p) => ({ type: "Feature", properties: { kind: p.kind, label: p.label ?? "" }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
    });
  }, [ready, boundary, liveBoundary, fix, points, quests, zones, sectorCounts, tracked]);

  useEffect(() => {
    const f = fx.current;
    if (!f || !fxReady) return;
    f.setQuests(quests.map((q) => ({ id: q.id, lat: q.lat, lng: q.lng, radiusM: q.radiusM ?? 40, done: q.done, flash: !!q.flash, reward: q.reward ?? null, abandoned: !!q.abandoned, treasure: !!q.treasure })));
    const people: import("./map3d").Person3D[] = points
      .filter((p) => p.kind === "partner")
      .map((p) => ({ id: `partner-${p.id}`, lat: p.lat, lng: p.lng, kind: "partner", look: "fugitive", fixAt: p.fixAt ? Date.parse(p.fixAt) : undefined }));
    if (fix) people.push({ id: "me", lat: fix.lat, lng: fix.lng, kind: "me", look: meLook, acc: fix.acc });
    f.setPeople(people);
    f.setZones(zones);
  }, [fxReady, fix, points, quests, zones, meLook]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 1400, essential: true });
  }, [focus]);

  const centerOnMe = () => {
    if (fix && map.current) {
      followed.current = true;
      map.current.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.current.getZoom(), 16.5) });
    }
  };

  return (
    <div className="mapbox">
      <div ref={el} className="ml" />
      {failed && <div className="full"><p className="muted">La mappa non si è caricata. Controlla la connessione.</p></div>}
      {recovered && <button type="button" className="chip glass maplite" onClick={() => setRecovered(false)}>Mappa ricaricata in modalità leggera ✕</button>}
      {fix && (
        <button type="button" className="fab glass" style={{ position: "absolute", right: 12, bottom: "calc(var(--safe-bottom) + 92px)", zIndex: 6 }} onClick={centerOnMe} aria-label="Centra su di me">
          <Glyph.locate />
        </button>
      )}
    </div>
  );
}
