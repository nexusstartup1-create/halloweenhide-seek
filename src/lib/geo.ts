export type LngLat = [number, number];

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearing(lat1: number, lng1: number, lat2: number, lng2: number) {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
export function compass(deg: number) {
  return DIRS[Math.round(deg / 45) % 8];
}

export function inPolygon(lng: number, lat: number, poly: LngLat[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance in metres from a point to the nearest polygon edge (local flat projection). */
export function distanceToEdgeM(lng: number, lat: number, poly: LngLat[]) {
  const kx = 111320 * Math.cos(rad(lat));
  const ky = 110540;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = (poly[j][0] - lng) * kx, ay = (poly[j][1] - lat) * ky;
    const bx = (poly[i][0] - lng) * kx, by = (poly[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const px = ax + t * dx, py = ay + t * dy;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

export function bbox(poly: LngLat[]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { minLng: Math.min(...xs), maxLng: Math.max(...xs), minLat: Math.min(...ys), maxLat: Math.max(...ys) };
}

/** 3x3 grid over the boundary's bounding box, C1 top-left to C9 bottom-right. */
export function sectorOf(lng: number, lat: number, poly: LngLat[]) {
  const b = bbox(poly);
  const col = Math.max(0, Math.min(2, Math.floor(((lng - b.minLng) / (b.maxLng - b.minLng)) * 3)));
  const row = Math.max(0, Math.min(2, Math.floor(((b.maxLat - lat) / (b.maxLat - b.minLat)) * 3)));
  return `C${row * 3 + col + 1}`;
}

export function neighbours(sector: string) {
  const n = Number(sector.slice(1)) - 1;
  const r = Math.floor(n / 3), c = n % 3;
  const out: string[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) out.push(`C${rr * 3 + cc + 1}`);
    }
  return out;
}

export function sectorPolygons(poly: LngLat[]) {
  const b = bbox(poly);
  const w = (b.maxLng - b.minLng) / 3, h = (b.maxLat - b.minLat) / 3;
  const out: { id: string; ring: LngLat[]; center: LngLat }[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const x0 = b.minLng + c * w, y1 = b.maxLat - r * h;
      const ring: LngLat[] = [[x0, y1], [x0 + w, y1], [x0 + w, y1 - h], [x0, y1 - h], [x0, y1]];
      out.push({ id: `C${r * 3 + c + 1}`, ring, center: [x0 + w / 2, y1 - h / 2] });
    }
  return out;
}
