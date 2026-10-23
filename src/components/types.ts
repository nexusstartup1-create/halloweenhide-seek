export type Phase = "LOBBY" | "HEAD_START" | "LIVE" | "PAUSED" | "ENDED";
export type LngLat = [number, number];
export type CardStateName = "LOCKED" | "READY" | "ACTIVE" | "COOLDOWN" | "SPENT";
export type Role = "HUNTER" | "FUGITIVE";

export interface Card {
  id: number;
  code: "GHOST_SHIELD" | "NEBBIA" | "ECO" | "RADAR_PING" | "TRACCIA" | "SUSSURRO" | "ZOMBIE" | "JUMPSCARE";
  state: CardStateName;
  usesLeft: number | null;
  activeUntil: string | null;
  cooldownUntil: string | null;
  target: string | null;
}

/** Team chats, or "G<id>" for a group chat. */
export type Channel = "HUNTERS" | "FUGITIVES" | "BROADCAST" | `G${number}`;

export interface Message {
  id: number;
  channel: Channel;
  kind: "USER" | "SYSTEM";
  body: string;
  at: string;
  sender: string | null;
  mine: boolean | null;
  sender_id: string | null;
  deleted: boolean;
  audio: boolean;
  audio_ms: number | null;
  /** Push-to-talk message and its playback effect. */
  radio?: "police" | "ghost" | null;
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
  /** Card unlocked by completing it. */
  reward?: "ZOMBIE" | "GHOST_SHIELD" | "ECO";
  /** No fixed place: AMBUSH needs a hunter nearby, STREET is anywhere in the zone with passers-by. */
  special?: "AMBUSH" | "STREET";
}

export interface GameState {
  serverNow: number;
  game: {
    code: string; zone: string; zoneName: string;
    round: number; phase: Phase; drawn: boolean; liveAt: string | null; endsAt: string | null;
    boundary: LngLat[]; whatsappUrl: string; winner: { kind: "HUNTER" | "PAIR"; name: string } | null;
    rolesDrawn: boolean; huntersN: number; huntersPlanned: number;
    headStartMin: number; liveMin: number; missionsMode: "chill" | "abbandonati"; pausedAt: string | null;
    options: { live: number[]; headStart: number[]; radius: number[] };
    hostId: string | null; hostName: string | null; hostStale: boolean; captureBounty: number; zoneRadiusM: number;
  };
  me: { id: string; name: string; role: Role | null; status: "ACTIVE" | "CAPTURED"; pairId: string | null; rejoinCode: string; spectator: boolean };
  /** Open SOS calls, with the live position of whoever sent them. */
  sos: { id: number; playerId: string; name: string; lat: number | null; lng: number | null; acc: number | null; fixAt: string | null; at: string; responders: string[]; mine: boolean }[];
  hostView: { id: string; name: string; role: Role | null; status: string; spectator: boolean; rejoinCode: string; lastSeen: string | null }[] | null;
  avatars: Record<string, number>;
  typing: { id: string; name: string; channel: Message["channel"]; audio: boolean }[];
  lobby: {
    players: { id: string; name: string; role: Role | null; pairId: string | null; spectator: boolean; partnerPick: string | null }[];
    pairs: { id: string; name: string; members: string[] }[];
  };
  cards: Card[];
  messages: Message[];
  channels: Channel[];
  groups: { channel: Channel; name: string; createdBy: string | null; members: { id: string; name: string }[] }[];
  alerts: Alert[];
  deletedIds: number[];
  /** Set for ghosts: they capture like hunters. */
  ghostCapture?: { attemptsLeft: number; lockedS: number; stolen: number } | null;
  results: {
    fallen: { id: string; name: string; pair: string; lost: number; by: string; at: string; risen?: boolean }[];
    standings: {
      general: { id: string; name: string; role: Role; ghost: boolean; points: number; detail: string }[];
      hunters: { id: string; name: string; points: number }[];
      ghosts: { id: string; name: string; points: number; detail: string }[];
      missions: { id: string; name: string; count: number; points: number; detail: string }[];
    };
    hunters: { id: string; name: string; stolen: number; ghost?: boolean }[];
    pairs: { id: string; name: string; pool: number; active: number; members: { id: string; name: string }[] }[];
  } | null;
  hunter?: {
    stolen: number; rank: number;
    hunters: { id: string; name: string; stolen: number; ghost?: boolean }[];
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
