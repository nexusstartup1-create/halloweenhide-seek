export type Phase = "LOBBY" | "HEAD_START" | "LIVE" | "ENDED";
export type LngLat = [number, number];
export type CardStateName = "LOCKED" | "READY" | "ACTIVE" | "COOLDOWN" | "SPENT";
export type Role = "HUNTER" | "FUGITIVE";

export interface Card {
  id: number;
  code: "GHOST_SHIELD" | "NEBBIA" | "ECO" | "RADAR_PING" | "TRACCIA" | "SUSSURRO";
  state: CardStateName;
  usesLeft: number | null;
  activeUntil: string | null;
  cooldownUntil: string | null;
  target: string | null;
}

export interface Message {
  id: number;
  channel: "HUNTERS" | "FUGITIVES" | "BROADCAST";
  kind: "USER" | "SYSTEM";
  body: string;
  at: string;
  sender: string | null;
  mine: boolean | null;
  sender_id: string | null;
  deleted: boolean;
  audio: boolean;
  audio_ms: number | null;
  proof_id: number | null;
  proof_kind: "PHOTO" | "VIDEO" | null;
}

export interface Alert { id: number; kind: string; body: string; at: string }

export interface Ping { id: number; origin: string; sectors: Record<string, number>; expires_at: string; hunter: string }

export interface Mission {
  id: string; title: string; place: string; lat: number; lng: number; radiusM: number;
  kind: "PHOTO" | "VIDEO"; task: string; points: number; proofId: number | null;
  flashUntil: string | null; flashPoints: number | null;
  abandoned?: boolean;
}

export interface GameState {
  serverNow: number;
  game: {
    code: string; zone: "cirenaica" | "sandonato"; zoneName: string;
    round: number; phase: Phase; drawn: boolean; liveAt: string | null; endsAt: string | null;
    boundary: LngLat[]; whatsappUrl: string; winner: { kind: "HUNTER" | "PAIR"; name: string } | null;
    headStartMin: number; liveMin: number;
    hostId: string | null; hostName: string | null; hostStale: boolean; captureBounty: number; zoneRadiusM: number;
  };
  me: { id: string; name: string; role: Role | null; status: "ACTIVE" | "CAPTURED"; pairId: string | null; rejoinCode: string };
  avatars: Record<string, number>;
  typing: { id: string; name: string; channel: Message["channel"]; audio: boolean }[];
  lobby: {
    players: { id: string; name: string; role: Role | null; pairId: string | null }[];
    pairs: { id: string; name: string; members: string[] }[];
  };
  cards: Card[];
  messages: Message[];
  channels: Message["channel"][];
  alerts: Alert[];
  deletedIds: number[];
  results: {
    hunters: { id: string; name: string; stolen: number }[];
    pairs: { id: string; name: string; pool: number; active: number }[];
  } | null;
  hunter?: {
    stolen: number; rank: number;
    hunters: { id: string; name: string; stolen: number }[];
    fugitives: { pairId: string; captured: boolean }[];
    pings: Ping[];
    lastPingSectors: string[];
    track: { sector: string; count: number; until: string } | null;
    attemptsLeft: number; lockedS: number;
    zones: { lat: number; lng: number; radiusM: number; ageS: number }[];
  };
  fugitive?: {
    password: string;
    pair: { id: string; name: string; pool: number; active: number };
    myShare: number;
    partner: { id: string; name: string; status: string; share: number; distanceM: number | null; dir: string | null; lat: number | null; lng: number | null; fixAt: string | null } | null;
    missions: Mission[];
    leader: { name: string; pool: number; isMe: boolean } | null;
  };
}

export interface Fix { lat: number; lng: number; acc: number; at: number }
