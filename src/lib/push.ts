import webpush from "web-push";
import { after } from "next/server";
import { q } from "./db";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://nighthunt.vercel.app", pub, priv);
  configured = true;
  return true;
}

export async function saveSubscription(playerId: string, sub: webpush.PushSubscription) {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("bad subscription");
  await q(
    `insert into push_subs (endpoint, player_id, sub) values ($1, $2, $3)
     on conflict (endpoint) do update set player_id = excluded.player_id, sub = excluded.sub`,
    [sub.endpoint, playerId, JSON.stringify(sub)],
  );
}

async function send(playerIds: string[], title: string, body: string, tag: string) {
  if (!playerIds.length || !configure()) return;
  const subs = await q<{ endpoint: string; sub: webpush.PushSubscription }>("select endpoint, sub from push_subs where player_id = any($1)", [playerIds]);
  const payload = JSON.stringify({ title, body, tag });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.sub, payload, { TTL: 300, urgency: "high" });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await q("delete from push_subs where endpoint = $1", [s.endpoint]);
        else console.warn("push failed", code);
      }
    }),
  );
}

/** "Prova notifica": a push to this player after `delayS`, so there's time to close the app. Returns how many phones are subscribed. */
export async function testPush(playerId: string, delayS = 10) {
  const [{ n }] = await q<{ n: number }>("select count(*)::int as n from push_subs where player_id = $1", [playerId]);
  if (n) after(() => new Promise((r) => setTimeout(r, delayS * 1000)).then(() => send([playerId], "🔔 Prova riuscita", "Le notifiche di Night Hunt arrivano anche con l'app chiusa.", "test")));
  return n;
}

/** Sends after the response is out, so a slow push service never delays the game. */
export function notify(playerIds: string[], title: string, body: string, tag = "cnh") {
  try {
    after(() => send(playerIds, title, body, tag));
  } catch {
    // Outside a request (scripts): send right away.
    void send(playerIds, title, body, tag);
  }
}
