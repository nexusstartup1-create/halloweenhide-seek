"use client";
import { useEffect, useRef, useState } from "react";
import { RoleCharacter } from "./GhostAnim";
import { phoneEnv, useInstallPrompt } from "./PhoneSetup";
import { PumpkinCat } from "./PumpkinCat";

const KEY = "cnh_onboarded";

export function onboardingDone() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; }
}
function markDone() {
  try { localStorage.setItem(KEY, "1"); } catch {}
}

type Perm = "unknown" | "granted" | "denied" | "unsupported";

async function queryPerm(name: "geolocation" | "notifications" | "microphone"): Promise<Perm> {
  try {
    if (name === "notifications" && !("Notification" in window)) return "unsupported";
    if (name === "microphone" && !navigator.mediaDevices?.getUserMedia) return "unsupported";
    if (name === "geolocation" && !("geolocation" in navigator)) return "unsupported";
    const r = await navigator.permissions.query({ name: name as PermissionName });
    return r.state === "granted" ? "granted" : r.state === "denied" ? "denied" : "unknown";
  } catch {
    // Safari doesn't answer for every permission: ask when tapped.
    if (name === "notifications" && "Notification" in window) return Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "unknown";
    return "unknown";
  }
}

/** First visit: how it works, permissions with the reason for each, install. Three swipeable cards. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const { canPrompt, install } = useInstallPrompt();
  const [env, setEnv] = useState({ ios: false, standalone: false, push: false });
  const [perms, setPerms] = useState<Record<"geo" | "notif" | "mic", Perm>>({ geo: "unknown", notif: "unknown", mic: "unknown" });
  const [geoAcc, setGeoAcc] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setEnv(phoneEnv());
      const [geo, notif, mic] = await Promise.all([queryPerm("geolocation"), queryPerm("notifications"), queryPerm("microphone")]);
      setPerms({ geo, notif, mic });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = track.current;
    if (el) setStep(Math.round(el.scrollLeft / el.clientWidth));
  };
  const finish = () => {
    markDone();
    onDone();
  };

  const askGeo = () =>
    navigator.geolocation.getCurrentPosition(
      (p) => { setPerms((x) => ({ ...x, geo: "granted" })); setGeoAcc(Math.round(p.coords.accuracy)); },
      (e) => setPerms((x) => ({ ...x, geo: e.code === 1 ? "denied" : "unknown" })),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  const askNotif = async () => {
    const r = await Notification.requestPermission();
    setPerms((x) => ({ ...x, notif: r === "granted" ? "granted" : r === "denied" ? "denied" : "unknown" }));
  };
  const askMic = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setPerms((x) => ({ ...x, mic: "granted" }));
    } catch {
      setPerms((x) => ({ ...x, mic: "denied" }));
    }
  };

  const iosNeedsHome = env.ios && !env.standalone;
  const notifBlockedByIos = iosNeedsHome && perms.notif === "unsupported";

  const row = (icon: string, title: string, why: string, state: Perm, ask: () => void, extra?: string, unsupportedText = "Non disponibile su questo telefono") => (
    <div className={`perm ${state}`}>
      <span className="pi" aria-hidden="true">{icon}</span>
      <span className="pt">
        <b>{title}</b>
        <small>{why}</small>
        {extra && <small className="px">{extra}</small>}
      </span>
      {state === "granted" ? <span className="pok" aria-label="Attivo">✓</span>
        : state === "denied" ? <span className="pno">Bloccato</span>
        : state === "unsupported" ? <span className="pno">{unsupportedText}</span>
        : <button type="button" className="btn a sm" onClick={ask}>Consenti</button>}
    </div>
  );

  return (
    <div className="onb">
      <button type="button" className="onb-skip" onClick={finish}>Salta</button>
      <div className="onb-track" ref={track} onScroll={onScroll}>
        <section className="onb-card">
          <div className="onb-hero"><PumpkinCat /></div>
          <h1>Benvenuto a <span>Night Hunt</span></h1>
          <p className="onb-sub">Nascondino al buio per le strade di Bologna.</p>
          <ul className="onb-rules">
            <li><b>🎲 Ruoli a sorte.</b> Pochi cercatori, tutti gli altri scappano in coppia, col compagno che vi scegliete voi.</li>
            <li><b>📸 Missioni.</b> I fuggiaschi guadagnano punti con foto e video nei posti giusti. Alcune sbloccano carte.</li>
            <li><b>🔑 Cattura.</b> Il cercatore ti tocca, tu gli dici la tua password, lui la scrive. Ti ruba i punti.</li>
            <li><b>👻 Fantasmi.</b> Chi viene preso passa coi cercatori e caccia anche lui. Con la carta Zombie si risorge.</li>
          </ul>
          <div className="onb-duo" aria-hidden="true">
            <RoleCharacter role="HUNTER" size={80} />
            <RoleCharacter role="FUGITIVE" size={80} />
          </div>
        </section>

        <section className="onb-card">
          <h2>Prepara il telefono</h2>
          <p className="onb-sub">Tre permessi, ognuno per un motivo preciso. Puoi darli anche dopo, ma a partita iniziata è tardi.</p>
          <div className="perms">
            {row("📍", "Posizione", "Per la mappa, per sapere se sei vicino a una missione e per far vedere ai cercatori la tua zona (mai il punto esatto).", perms.geo, askGeo,
              geoAcc != null ? (geoAcc > 500 ? `Precisione ${geoAcc} m: su Android attiva "Usa posizione precisa" per il browser.` : `Precisione ${geoAcc} m: perfetto.`) : undefined)}
            {row("🔔", "Notifiche", "Ti avvisiamo se ti catturano, se un radar ti trova o se la squadra ti scrive, anche col telefono in tasca.", notifBlockedByIos ? "unsupported" : perms.notif, askNotif,
              undefined, notifBlockedByIos ? "Prima installa l'app (passo 3)" : "Non disponibile su questo telefono")}
            {row("🎙️", "Microfono", "Per la radio della squadra e i messaggi vocali. Registra solo mentre tieni premuto.", perms.mic, askMic)}
          </div>
          {Object.values(perms).includes("denied") && <p className="muted small">Se un permesso è bloccato: impostazioni del browser → questo sito → consenti.</p>}
        </section>

        <section className="onb-card">
          <h2>Installa l&apos;app</h2>
          <p className="onb-sub">Così si apre a schermo intero, non si chiude per sbaglio e le notifiche arrivano davvero.</p>
          {env.standalone ? (
            <div className="notice">✓ Stai già usando l&apos;app installata.</div>
          ) : canPrompt ? (
            <button type="button" className="btn a" onClick={() => install()}>Installa Night Hunt</button>
          ) : env.ios ? (
            <ol className="onb-steps">
              <li><span className="ios-share" aria-hidden="true" /> Tocca <b>Condividi</b> in basso in Safari</li>
              <li><span aria-hidden="true">➕</span> Scegli <b>Aggiungi alla schermata Home</b></li>
              <li><span aria-hidden="true">🎃</span> Apri Night Hunt <b>dall&apos;icona</b>, non da Safari: solo così arrivano le notifiche</li>
            </ol>
          ) : (
            <ol className="onb-steps">
              <li><span aria-hidden="true">⋮</span> Apri il <b>menu</b> del browser</li>
              <li><span aria-hidden="true">📲</span> Scegli <b>Installa app</b> (o Aggiungi a schermata Home)</li>
              <li><span aria-hidden="true">🎃</span> Apri Night Hunt dall&apos;icona</li>
            </ol>
          )}
        </section>
      </div>

      <div className="onb-foot">
        <div className="onb-dots" role="tablist" aria-label="Passaggi">
          {[0, 1, 2].map((i) => <button key={i} type="button" role="tab" aria-selected={step === i} aria-label={`Passo ${i + 1}`} className={step === i ? "on" : ""} onClick={() => go(i)} />)}
        </div>
        {step < 2 ? (
          <button type="button" className="btn a" onClick={() => go(step + 1)}>Avanti</button>
        ) : (
          <button type="button" className="btn a" onClick={finish}>Entra in gioco</button>
        )}
      </div>
    </div>
  );
}
