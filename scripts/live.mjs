// Usage: npm run live          live view of who is playing, refreshed every 5 seconds (read only)
//        npm run live -- 10    refresh every 10 seconds
import pg from "pg";

const EVERY_S = Math.max(2, Number(process.argv[2]) || 5);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const C = { dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", violet: "\x1b[35m", red: "\x1b[31m", yellow: "\x1b[33m", off: "\x1b[0m" };
const n = async (sql) => (await db.query(sql)).rows[0].n;
const time = (d) => new Date(d).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" });

const PHASE = `case
  when g.started_at is null then 'LOBBY'
  when g.ended_at is not null or g.ends_at <= now() then 'FINITA'
  when g.paused_at is not null then 'PAUSA'
  when g.live_at > now() then 'VANTAGGIO'
  else 'LIVE' end`;

async function frame() {
  const [online, today, games, sos] = await Promise.all([
    n("select count(*)::int n from players where last_seen > now() - interval '1 minute'"),
    n("select count(*)::int n from players where joined_at > current_date"),
    n("select count(*)::int n from game where created_at > current_date"),
    n("select count(*)::int n from sos where resolved_at is null and at > now() - interval '2 hours'"),
  ]);

  // Games touched in the last 3 hours that aren't over.
  const { rows: live } = await db.query(`
    select g.code, g.zone, ${PHASE} fase,
      greatest(0, ceil(extract(epoch from g.ends_at - now()) / 60))::int min_left,
      count(p.*)::int giocatori,
      count(p.*) filter (where p.last_seen > now() - interval '1 minute')::int online,
      count(p.*) filter (where p.role = 'HUNTER')::int cercatori,
      count(p.*) filter (where p.role = 'FUGITIVE' and p.status = 'ACTIVE')::int liberi,
      count(p.*) filter (where p.status = 'CAPTURED')::int presi
    from game g join players p on p.game_id = g.id
    where g.ended_at is null and (g.ends_at is null or g.ends_at > now())
      and g.created_at > now() - interval '3 hours'
    group by g.id order by online desc, g.created_at desc limit 15`);

  const { rows: events } = await db.query(`
    select * from (
      select p.joined_at at, 'entra' kind, p.name || ' in ' || g.code txt from players p join game g on g.id = p.game_id
      union all
      select a.at, 'cattura', h.name || ' ha preso ' || t.name || ' (' || g.code || ')' from capture_attempts a
        join players h on h.id = a.hunter_id join players t on t.id = a.target_id join game g on g.id = h.game_id where a.result = 'OK'
      union all
      select pr.at, 'missione', p.name || ' +' || pr.points || ' ' || pr.mission_id || ' (' || g.code || ')' from proofs pr
        join players p on p.id = pr.player_id join game g on g.id = p.game_id
      union all
      select s.at, 'SOS', p.name || ' (' || g.code || ')' || case when s.resolved_at is null then '' else ' · risolto' end from sos s
        join players p on p.id = s.player_id join game g on g.id = s.game_id
    ) e where at > now() - interval '6 hours' order by at desc limit 12`);

  const out = [];
  out.push(`${C.bold}${C.violet}NIGHT HUNT · LIVE${C.off}  ${C.dim}${time(Date.now())} · aggiorna ogni ${EVERY_S}s · Ctrl+C per uscire${C.off}`, "");
  out.push(`  ${C.green}${C.bold}${online}${C.off} online ora    ${C.bold}${today}${C.off} entrati oggi    ${C.bold}${games}${C.off} partite create oggi    ${sos ? `${C.red}${C.bold}${sos} SOS APERTI${C.off}` : `${C.dim}nessun SOS${C.off}`}`, "");

  out.push(`${C.bold}Partite aperte${C.off}`);
  if (!live.length) out.push(`  ${C.dim}nessuna${C.off}`);
  for (const r of live) {
    const color = r.fase === "LIVE" ? C.green : r.fase === "LOBBY" ? C.dim : C.yellow;
    const left = r.fase === "LIVE" || r.fase === "VANTAGGIO" || r.fase === "PAUSA" ? `  ${r.min_left} min` : "";
    out.push(
      `  ${C.bold}${r.code}${C.off}  ${color}${r.fase.padEnd(9)}${C.off} ${r.zone.padEnd(12)} ` +
        `${String(r.online).padStart(2)}/${String(r.giocatori).padEnd(2)} online   ` +
        `${r.cercatori} cercatori · ${r.liberi} liberi · ${r.presi} presi${left}`,
    );
  }

  out.push("", `${C.bold}Ultimi eventi${C.off}`);
  if (!events.length) out.push(`  ${C.dim}niente nelle ultime 6 ore${C.off}`);
  const tag = { entra: C.dim, cattura: C.red, missione: C.green, SOS: C.red + C.bold };
  for (const e of events) out.push(`  ${C.dim}${time(e.at)}${C.off}  ${tag[e.kind]}${e.kind.padEnd(8)}${C.off} ${e.txt}`);

  process.stdout.write("\x1b[2J\x1b[H" + out.join("\n") + "\n");
}

process.on("SIGINT", async () => {
  await db.end();
  process.exit(0);
});

for (;;) {
  try {
    await frame();
  } catch (e) {
    console.error("Errore:", e.message);
  }
  await new Promise((r) => setTimeout(r, EVERY_S * 1000));
}
