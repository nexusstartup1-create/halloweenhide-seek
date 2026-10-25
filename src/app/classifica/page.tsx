import type { Metadata } from "next";
import Link from "next/link";
import { RankBadge } from "@/components/Rank";
import { q } from "@/lib/db";
import { RANKS, rankOf } from "@/lib/ranks";

export const metadata: Metadata = { title: "Classifica di Bologna · Night Hunt" };
// Always fresh: rank points change at the end of every game.
export const dynamic = "force-dynamic";

const TOP = 100;

export default async function Classifica() {
  const rows = await q<{ name: string; rp: number; podiums: number; wins: number; games: number }>(
    "select name, rp, podiums, wins, games from profiles where rp > 0 order by rp desc, wins desc, podiums desc, updated_at asc limit $1",
    [TOP],
  );
  return (
    <main className="legal board">
      <Link href="/" className="linkbtn">← Torna al gioco</Link>
      <h1>Classifica di Bologna</h1>
      <p className="muted">
        I giocatori di Night Hunt con più punti rango. Si sale solo arrivando sul podio di una partita vera (almeno 4 giocatori in strada):
        30 punti al primo posto, 20 al secondo, 10 al terzo.
      </p>
      {rows.length === 0 ? (
        <p className="board-empty">Ancora nessuno sul podio. La prima Leggenda di Bologna potresti essere tu.</p>
      ) : (
        <ol className="board-list">
          {rows.map((r, i) => {
            const rank = rankOf(r.rp);
            return (
              <li key={i} className={i < 3 ? `top top${i + 1}` : undefined} style={{ ["--rc" as string]: rank.color, ["--rg" as string]: rank.glow }}>
                <span className="pos">{i + 1}</span>
                <RankBadge index={rank.index} size={34} title={false} />
                <span className="bwho">
                  <b>{r.name}</b>
                  <span>{rank.name} · {r.wins} {r.wins === 1 ? "vittoria" : "vittorie"} · {r.podiums} {r.podiums === 1 ? "podio" : "podi"} in {r.games} {r.games === 1 ? "partita" : "partite"}</span>
                </span>
                <span className="rp">{r.rp}<small> RP</small></span>
              </li>
            );
          })}
        </ol>
      )}
      <h2>I ranghi</h2>
      <ul className="board-ranks">
        {RANKS.map((r, i) => (
          <li key={r.name} style={{ ["--rc" as string]: r.color, ["--rg" as string]: r.glow }}>
            <RankBadge index={i} size={26} title={false} /> <b>{r.name}</b> <span>da {r.min} RP</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        In classifica compare il nome con cui giochi, solo se sei salito almeno una volta sul podio. Per uscirne usa &quot;Cancella i miei dati&quot; nelle
        impostazioni del gioco. <Link href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}
