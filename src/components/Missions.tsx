"use client";
import { upload } from "@vercel/blob/client";
import { useEffect, useState } from "react";
import type { Fix, GameState, Mission } from "./types";
import { play } from "./sound";
import { buzz, post, pts } from "./util";

type Toast = (text: string, bad?: boolean) => void;

const MAX_VIDEO_S = 30;
const MAX_VIDEO_MB = 120;

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/** Shrinks a phone photo to 1600 px JPEG so it uploads fast on mobile data. Falls back to the original. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return out ?? file;
  } catch {
    return file;
  }
}

function videoDuration(file: File) {
  return new Promise<number>((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

export function ProofMedia({ id, kind }: { id: number; kind: "PHOTO" | "VIDEO" | null }) {
  const src = `/api/media/${id}`;
  return kind === "VIDEO" ? (
    <video className="proof" src={src} controls playsInline preload="metadata" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="proof" src={src} alt="Prova della missione" loading="lazy" />
  );
}

function MissionCard({ m, s, fix, open, onToggle, refresh, toast }: {
  m: Mission & { d: number | null }; s: GameState; fix: Fix | null; open: boolean; onToggle: () => void; refresh: () => void; toast: Toast;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  // Special missions have no fixed place: the server checks (hunter nearby, or inside the zone).
  const near = !!m.special || (m.d != null && m.d <= m.radiusM + Math.min(fix?.acc ?? 0, 25));
  const canPlay = (s.game.phase === "LIVE" || s.game.phase === "HEAD_START") && s.me.status === "ACTIVE";
  const done = m.proofId != null;
  const flash = !done && m.flashUntil != null;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (m.kind === "VIDEO") {
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) return toast(`Video troppo pesante (max ${MAX_VIDEO_MB} MB). Registrane uno più corto.`, true);
      const d = await videoDuration(f);
      if (d > MAX_VIDEO_S + 2) return toast(`Il video dura ${Math.round(d)} s. Massimo ${MAX_VIDEO_S} s.`, true);
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const send = async () => {
    if (!file || !fix || !s.me.pairId) return;
    if (m.special === "STREET" && !confirm("Il passante ha accettato di partecipare e, se si vede, di essere ripreso?")) return;
    setProgress(0);
    try {
      const data = m.kind === "PHOTO" ? await shrinkPhoto(file) : file;
      const ext = m.kind === "PHOTO" ? "jpg" : (file.name.split(".").pop() || "mp4").toLowerCase();
      const pathname = `r${s.game.round}/${s.me.pairId}/${m.id}/prova.${ext}`;
      const blob = await upload(pathname, data, {
        access: "private",
        handleUploadUrl: "/api/upload",
        contentType: m.kind === "PHOTO" ? "image/jpeg" : file.type || "video/mp4",
        clientPayload: JSON.stringify({ missionId: m.id, lat: fix.lat, lng: fix.lng, acc: fix.acc }),
        multipart: data.size > 8 * 1024 * 1024,
        onUploadProgress: (p) => setProgress(p.percentage),
      });
      const r = await post<{ message: string }>("/api/quests", { missionId: m.id, pathname: blob.pathname, lat: fix.lat, lng: fix.lng, acc: fix.acc });
      buzz([60, 40, 60]);
      play("mission");
      toast(r.message);
      setFile(null);
      setPreview(null);
      refresh();
    } catch (e) {
      toast((e as Error).message || "Invio non riuscito. Riprova.", true);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className={`quest ${done ? "done" : ""} ${near && !done ? "near" : ""} ${flash ? "flash" : ""}`}>
      <button type="button" onClick={onToggle}>
        <span className="qt">{m.title}</span>
        <span className="qp num">{done ? "✓" : `+${pts(flash ? m.flashPoints! : m.points)}`}</span>
        <span className="lbl">{m.special ? m.place : `${m.place} · ${m.d != null ? `${Math.round(m.d)} m` : "distanza ?"}${near && !done ? " · sei qui" : ""}`}</span>
        <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
          {flash && <span className="chip fr">Lampo ×2</span>}
          {m.abandoned && <span className="chip ghostchip">Abbandonato</span>}
          {m.special === "AMBUSH" && <span className="chip fr">Agguato</span>}
          {m.special === "STREET" && <span className="chip ghostchip">Con i passanti</span>}
          {m.reward && !done && <span className={`chip rewardchip ${m.reward === "ZOMBIE" ? "zombie" : ""}`}>🃏 {m.reward === "ZOMBIE" ? "Zombie" : m.reward === "GHOST_SHIELD" ? "Ghost Shield" : "Eco"}</span>}
          <span className={`chip ${m.kind === "VIDEO" ? "fa" : "a"}`}>{m.kind === "VIDEO" ? "Video" : "Foto"}</span>
        </span>
      </button>
      {open && (
        <div className="body">
          <p className="small">{m.task}</p>
          {done ? (
            <ProofMedia id={m.proofId!} kind={m.kind} />
          ) : preview ? (
            <>
              {m.kind === "VIDEO" ? <video className="proof" src={preview} controls playsInline /> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="proof" src={preview} alt="Anteprima" />
              )}
              {progress != null && <div className="meter"><i style={{ width: `${progress}%`, background: "var(--accent)" }} /></div>}
              <div className="row">
                <button type="button" className="btn ghost sm" disabled={progress != null} onClick={() => { setFile(null); setPreview(null); }}>Rifai</button>
                <button type="button" className="btn a sm" style={{ flex: 1 }} disabled={progress != null || !near || !canPlay} onClick={send}>
                  {progress != null ? `Invio ${Math.round(progress)}%` : !near ? "Torna sul posto per inviare" : "Invia la prova"}
                </button>
              </div>
            </>
          ) : (
            <label className={`btn a ${!near || !canPlay ? "off" : ""}`}>
              {!canPlay ? "Missioni chiuse" : !near ? `Vai entro ${m.radiusM} m da ${m.place}` : m.kind === "VIDEO" ? `Registra video (max ${MAX_VIDEO_S} s)` : "Scatta la foto"}
              <input
                type="file"
                accept={m.kind === "VIDEO" ? "video/*" : "image/*"}
                capture="environment"
                hidden
                disabled={!near || !canPlay}
                onChange={pick}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export function Missions({ s, fix, refresh, toast }: { s: GameState; fix: Fix | null; refresh: () => void; toast: Toast }) {
  const f = s.fugitive!;
  const [open, setOpen] = useState<string | null>(null);
  const list = f.missions
    .map((m) => ({ ...m, d: fix && !m.special ? dist(fix, m) : null }))
    .sort(
      (a, b) =>
        Number(a.proofId != null) - Number(b.proofId != null) ||
        Number(b.flashUntil != null) - Number(a.flashUntil != null) ||
        (a.d ?? 0) - (b.d ?? 0),
    );
  const doneCount = f.missions.filter((m) => m.proofId != null).length;

  return (
    <div className="pad">
      <div className="row">
        <span className="lbl">Missioni · {doneCount}/{f.missions.length} fatte</span>
        {!fix && <span className="chip">GPS…</span>}
      </div>
      {f.missions.some((m) => m.abandoned) && (
        <div className="notice danger-note">
          <b>Posti abbandonati:</b> dentro o fuori lo decidete voi, e spesso sono proprietà privata. Se entrate: mai da soli, torcia sempre accesa quando vi muovete, niente piani alti, tetti, silos o pavimenti che scricchiolano, guardate dove mettete i piedi (vetri, chiodi, buchi). Se dentro c&apos;è già qualcuno, uscite.
        </div>
      )}
      <p className="muted small">Andate sul posto e fate la foto o il video richiesto. I punti arrivano appena la prova è inviata. Le prove le vedono solo i fuggiaschi, e tutti a fine partita.</p>
      <p className="muted small"><b>Brivido sì, rischi no:</b> si cammina e non si corre, niente strade, binari o bordi d&apos;acqua, voce bassa dove la gente dorme, e chi non è del gioco non si spaventa e non si riprende.</p>
      {list.filter((m) => !m.special).map((m) => (
        <MissionCard key={m.id} m={m} s={s} fix={fix} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} refresh={refresh} toast={toast} />
      ))}
      <div className="lbl" style={{ marginTop: 10 }}>Agguati e scherzetti</div>
      <p className="muted small">
        <b>Agguati:</b> valgono solo se quando inviate la prova un cercatore è davvero vicino (lo controlla il GPS). Se vi vede, può catturarvi.
        {" "}<b>Con i passanti:</b> solo con chi ha voglia di giocare e dice di sì. Niente spaventi a sorpresa, e chi non vuole non si riprende.
      </p>
      {list.filter((m) => m.special).map((m) => (
        <MissionCard key={m.id} m={m} s={s} fix={fix} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} refresh={refresh} toast={toast} />
      ))}
    </div>
  );
}
