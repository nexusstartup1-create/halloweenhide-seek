"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { LngLat } from "./types";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const FONT = ["Open Sans Bold"];
/** At 1× the whole game plays in about this long. */
const BASE_PLAY_MS = 75_000;

type Mode = "H" | "F" | "G";
interface ReplayData {
  start: number;
  live: number | null;
  end: number;
  boundary: LngLat[];
  players: { id: string; name: string; role: "HUNTER" | "FUGITIVE"; pairId: string | null; pair: string | null }[];
  tracks: Record<string, [number, number, number, Mode][]>;
  captures: { victim: string; hunter: string | null; t: number }[];
}

const HUNTER = "#ff3040";
const GHOST = "#7dffb0";
const PAIRS = ["#ff9a1f", "#3ee0ff", "#ffd23a", "#c77dff", "#4dd17a", "#ff6fae", "#7aa8ff", "#f5f5f5", "#ffb38a", "#9ef0e0"];

const clock = (ms: number) => new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/** Position at time t: interpolated between the two fixes around it. Null before the first fix. */
function at(tr: [number, number, number, Mode][], t: number): { lat: number; lng: number; mode: Mode; i: number } | null {
  if (!tr.length || t < tr[0][0]) return null;
  let lo = 0, hi = tr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tr[mid][0] <= t) lo = mid; else hi = mid - 1;
  }
  const a = tr[lo], b = tr[lo + 1];
  if (!b) return { lat: a[1], lng: a[2], mode: a[3], i: lo };
  const k = Math.min(1, (t - a[0]) / Math.max(1, b[0] - a[0]));
  return { lat: a[1] + (b[1] - a[1]) * k, lng: a[2] + (b[2] - a[2]) * k, mode: a[3], i: lo };
}

/** End-of-game replay: everyone's route drawn as the night goes by, captures flashing where they happened. */
export function Replay({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const tRef = useRef(0);

  useEffect(() => {
    fetch("/api/replay", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Replay non disponibile.");
        setData(d);
        tRef.current = d.start;
        setT(d.start);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const colorOf = useMemo(() => {
    const pairIdx = new Map<string, number>();
    for (const p of data?.players ?? []) if (p.pairId && !pairIdx.has(p.pairId)) pairIdx.set(p.pairId, pairIdx.size);
    return (id: string, mode: Mode) => {
      if (mode === "H") return HUNTER;
      if (mode === "G") return GHOST;
      const p = data?.players.find((x) => x.id === id);
      return PAIRS[(pairIdx.get(p?.pairId ?? "") ?? 0) % PAIRS.length];
    };
  }, [data]);

  // Map.
  useEffect(() => {
    if (!data || !el.current) return;
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      if (cancelled || !el.current) return;
      const xs = data.boundary.map((p) => p[0]), ys = data.boundary.map((p) => p[1]);
      const m = new ml.Map({
        container: el.current, style: STYLE, attributionControl: { compact: true },
        bounds: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], fitBoundsOptions: { padding: 30 },
        dragRotate: false, pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.on("load", () => {
        const empty = { type: "FeatureCollection" as const, features: [] };
        for (const id of ["boundary", "trails", "heads", "caps"]) m.addSource(id, { type: "geojson", data: empty });
        (m.getSource("boundary") as GeoJSONSource).setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...data.boundary, data.boundary[0]] } });
        m.addLayer({ id: "boundary", type: "line", source: "boundary", paint: { "line-color": "#a970ff", "line-width": 2, "line-opacity": 0.7 } });
        m.addLayer({ id: "trails-glow", type: "line", source: "trails", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 8, "line-opacity": 0.18, "line-blur": 4 } });
        m.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": ["case", ["get", "dim"], 0.25, 0.9] } });
        m.addLayer({ id: "caps-ring", type: "circle", source: "caps", paint: { "circle-radius": ["get", "r"], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ff3040", "circle-stroke-width": 2, "circle-stroke-opacity": ["get", "o"] } });
        m.addLayer({ id: "caps-x", type: "symbol", source: "caps", layout: { "text-field": "✕", "text-font": FONT, "text-size": 14, "text-allow-overlap": true }, paint: { "text-color": "#ff3040", "text-halo-color": "#000", "text-halo-width": 1.5 } });
        m.addLayer({ id: "heads", type: "circle", source: "heads", paint: { "circle-radius": ["case", ["get", "focus"], 9, 6.5], "circle-color": ["get", "color"], "circle-stroke-color": "#0b0b0c", "circle-stroke-width": 2 } });
        m.addLayer({
          id: "names", type: "symbol", source: "heads",
          layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top", "text-allow-overlap": true },
          paint: { "text-color": "#fff", "text-halo-color": "#0b0b0c", "text-halo-width": 2 },
        });
        setReady(true);
      });
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [data]);

  // Playback clock.
  useEffect(() => {
    if (!data || !playing) return;
    let raf = 0, last = performance.now();
    const rate = ((data.end - data.start) / BASE_PLAY_MS) * speed;
    const tick = (now: number) => {
      const next = Math.min(data.end, tRef.current + (now - last) * rate);
      last = now;
      tRef.current = next;
      setT(next);
      if (next >= data.end) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, playing, speed]);

  // Draw the frame for time t.
  const lastCap = useRef(-1);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !data) return;
    const trails: GeoJSON.Feature[] = [], heads: GeoJSON.Feature[] = [];
    let focusAt: [number, number] | null = null;
    for (const p of data.players) {
      const tr = data.tracks[p.id];
      const now = at(tr, t);
      if (!now) continue;
      // Trail split where the mode changes (a fugitive turning ghost changes colour).
      let seg: number[][] = [], mode = tr[0][3];
      const flush = (dim: boolean) => {
        if (seg.length > 1) trails.push({ type: "Feature", properties: { color: colorOf(p.id, mode), dim }, geometry: { type: "LineString", coordinates: seg } });
      };
      for (let i = 0; i <= now.i; i++) {
        if (tr[i][3] !== mode) { seg.push([tr[i][2], tr[i][1]]); flush(false); seg = []; mode = tr[i][3]; }
        seg.push([tr[i][2], tr[i][1]]);
      }
      seg.push([now.lng, now.lat]);
      flush(follow != null && follow !== p.id);
      heads.push({
        type: "Feature",
        properties: { color: colorOf(p.id, now.mode), label: now.mode === "G" ? `👻 ${p.name}` : p.name, focus: follow === p.id },
        geometry: { type: "Point", coordinates: [now.lng, now.lat] },
      });
      if (follow === p.id) focusAt = [now.lng, now.lat];
    }
    // Captures: a red ring that expands for a few seconds of replay, then stays as a cross.
    const span = (data.end - data.start) / BASE_PLAY_MS; // replay-ms per real ms at 1×
    const caps: GeoJSON.Feature[] = [];
    data.captures.forEach((c, i) => {
      if (c.t > t) return;
      const pos = at(data.tracks[c.victim] ?? [], c.t);
      if (!pos) return;
      const age = (t - c.t) / span; // real ms since it happened, at 1×
      const k = Math.min(1, age / 2500);
      caps.push({ type: "Feature", properties: { r: 6 + k * 30, o: 1 - k }, geometry: { type: "Point", coordinates: [pos.lng, pos.lat] } });
      if (i > lastCap.current) {
        lastCap.current = i;
        const name = (id: string | null) => data.players.find((p) => p.id === id)?.name ?? "?";
        setTicker(`${clock(c.t)} · ${name(c.hunter)} ha preso ${name(c.victim)}`);
      }
    });
    (m.getSource("trails") as GeoJSONSource).setData({ type: "FeatureCollection", features: trails });
    (m.getSource("heads") as GeoJSONSource).setData({ type: "FeatureCollection", features: heads });
    (m.getSource("caps") as GeoJSONSource).setData({ type: "FeatureCollection", features: caps });
    if (focusAt) m.easeTo({ center: focusAt, duration: 0 });
  }, [t, ready, data, colorOf, follow]);

  useEffect(() => {
    if (!ticker) return;
    const id = setTimeout(() => setTicker(null), 3500);
    return () => clearTimeout(id);
  }, [ticker]);

  const seek = (v: number) => {
    if (!data) return;
    tRef.current = v;
    lastCap.current = data.captures.filter((c) => c.t <= v).length - 1;
    setT(v);
  };
  const restart = () => { if (data) { seek(data.start); setPlaying(true); } };

  const phaseLabel = data ? (data.live && t < data.live ? "Vantaggio fuggiaschi" : "Caccia aperta") : "";
  const empty = data && data.players.length === 0;

  return (
    <div className="replay" role="dialog" aria-label="Replay della partita">
      <div ref={el} className="replay-map" />
      <div className="replay-top glass">
        <div>
          <b>Replay</b>
          <span>{data ? `${clock(t)} · ${phaseLabel}` : error ?? "Carico i percorsi…"}</span>
        </div>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Chiudi replay">✕</button>
      </div>
      {ticker && <div className="replay-ticker glass" role="status">✕ {ticker}</div>}
      {empty && <div className="replay-empty glass">Nessun percorso registrato in questa partita: il replay parte dalle partite giocate da oggi in poi.</div>}
      {data && !empty && (
        <div className="replay-bottom glass">
          <div className="replay-who">
            {data.players.map((p) => {
              const mode: Mode = p.role === "HUNTER" ? "H" : "F";
              return (
                <button key={p.id} type="button" className={follow === p.id ? "on" : ""} onClick={() => setFollow(follow === p.id ? null : p.id)}>
                  <i style={{ background: colorOf(p.id, mode) }} />{p.name}
                </button>
              );
            })}
          </div>
          <input
            type="range" className="replay-seek" min={data.start} max={data.end} step={1000} value={t}
            onChange={(e) => seek(Number(e.target.value))} aria-label="Momento della partita"
          />
          <div className="replay-ctrl">
            <span>{clock(data.start)}</span>
            <button type="button" className="btn sm" onClick={t >= data.end ? restart : () => setPlaying(!playing)}>
              {t >= data.end ? "↺ Da capo" : playing ? "❚❚ Pausa" : "▶ Play"}
            </button>
            <button type="button" className="btn sm" onClick={() => setSpeed(speed >= 4 ? 1 : speed * 2)} aria-label="Velocità">{speed}×</button>
            <span>{clock(data.end)}</span>
          </div>
          <p className="muted small">Tocca un nome per seguirlo. Rosso: cercatori · un colore per coppia · verde: fantasmi.</p>
        </div>
      )}
    </div>
  );
}
