import type { Metadata } from "next";
import Link from "next/link";
import { KEEP_DAYS } from "@/lib/game";

export const metadata: Metadata = { title: "Privacy · Night Hunt" };

/** Who to write to about personal data. Set CONTACT_EMAIL in the Vercel project settings. */
const CONTACT = process.env.CONTACT_EMAIL ?? "";

export default function Privacy() {
  return (
    <main className="legal">
      <Link href="/" className="linkbtn">← Torna al gioco</Link>
      <h1>Privacy</h1>
      <p className="muted">In breve: raccogliamo solo quello che serve per giocare, non lo vendiamo, non facciamo pubblicità né profilazione, e dopo {KEEP_DAYS} giorni dalla fine della partita cancelliamo tutto.</p>

      <h2>Chi gestisce i dati</h2>
      <p>
        Night Hunt, gioco di nascondino urbano.{" "}
        {CONTACT ? <>Per qualsiasi domanda sui tuoi dati scrivi a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : <>Per qualsiasi domanda sui tuoi dati rivolgiti all&apos;organizzatore della tua partita.</>}
      </p>

      <h2>Cosa raccogliamo e perché</h2>
      <ul>
        <li><b>Nome e foto profilo</b> (la foto è facoltativa): per farti riconoscere dagli altri giocatori della tua partita.</li>
        <li><b>Posizione GPS durante la partita</b>: per la mappa, per sapere se sei vicino a una missione e per il gioco. Ai cercatori arriva solo una <b>zona approssimativa</b>, mai il punto esatto; il tuo compagno di coppia vede la tua posizione.</li>
        <li><b>Il tuo percorso durante la partita</b> (un punto ogni pochi metri quando ti muovi): per il <b>replay a fine partita</b>, che vedono tutti i giocatori della stessa partita.</li>
        <li><b>Foto e video delle missioni</b>: li vedono i fuggiaschi durante la partita e tutti i giocatori a fine partita.</li>
        <li><b>Messaggi di testo e vocali</b> nella chat e nella radio: li vede chi è nel canale o nel gruppo a cui scrivi.</li>
        <li><b>SOS</b>: se mandi un SOS, la tua <b>posizione esatta</b> va a tutti i giocatori della partita, per poterti aiutare.</li>
        <li><b>Rango</b>: i punti rango restano legati al tuo telefono con un codice casuale. Se scegli di proteggerlo, salviamo il <b>nome account</b> che inventi e la password <b>solo cifrata</b> (nessuno può leggerla).</li>
        <li><b>Notifiche</b>: se le attivi, salviamo l&apos;indirizzo tecnico del tuo telefono per mandartele.</li>
        <li><b>Un cookie tecnico</b> per tenerti collegato, e alcune preferenze salvate solo sul tuo telefono (suoni, vibrazione, guida già vista). Nessun cookie di tracciamento o pubblicità.</li>
      </ul>
      <p>Posizione, notifiche e microfono si usano solo se li consenti dal telefono, e puoi toglierli quando vuoi dalle impostazioni del browser.</p>

      <h2>Su che base</h2>
      <p>Trattiamo questi dati per farti giocare, cioè per fornirti il servizio che hai chiesto entrando in una partita, e per la sicurezza dei giocatori (SOS).</p>

      <h2>Chi li vede</h2>
      <p>Solo gli altri giocatori della tua partita, come descritto sopra, e i fornitori tecnici che fanno funzionare l&apos;app (hosting, database, archivio dei file, notifiche push), che li trattano solo per conto nostro. Non vendiamo e non cediamo i dati a nessuno.</p>

      <h2>Per quanto tempo</h2>
      <p>Tutti i dati di una partita (posizioni, percorsi, foto, video, messaggi, giocatori) vengono <b>cancellati automaticamente {KEEP_DAYS} giorni dopo la fine</b>, o dopo {KEEP_DAYS * 2} giorni se la partita non è mai finita. Fa eccezione il <b>rango</b> (punti, podi, nome account): resta finché non lo cancelli con «Cancella i miei dati».</p>

      <h2>I tuoi diritti</h2>
      <p>
        Puoi chiedere di vedere, correggere o cancellare i tuoi dati, limitarne l&apos;uso od opporti. Il modo più veloce: nell&apos;app, <b>Impostazioni → Cancella i miei dati</b> cancella subito te e tutto quello che hai lasciato.
        Puoi anche presentare reclamo al <a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">Garante per la protezione dei dati personali</a>.
      </p>

      <h2>Età</h2>
      <p>Night Hunt è aperto a tutti. Per la legge italiana, chi ha meno di 14 anni può usarlo solo con il consenso di un genitore.</p>

      <p className="muted small">Vedi anche le <Link href="/regole">regole e la sicurezza</Link>.</p>
    </main>
  );
}
