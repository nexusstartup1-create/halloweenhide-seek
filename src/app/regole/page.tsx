import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Regole e sicurezza · Night Hunt" };

export default function Regole() {
  return (
    <main className="legal">
      <Link href="/" className="linkbtn">← Torna al gioco</Link>
      <h1>Regole e sicurezza</h1>
      <p className="muted">Night Hunt si gioca di notte, all&apos;aperto, in città. Il brivido sì, i rischi no. Entrando in una partita accetti queste regole.</p>

      <h2>Chi può giocare</h2>
      <ul>
        <li>Aperto a tutti. Chi è minorenne gioca con il permesso dei genitori, e chi ha meno di 14 anni anche con il loro consenso all&apos;uso dei dati.</li>
        <li>Partecipi volontariamente e sotto la tua responsabilità: valuta tu se te la senti, e fermati quando vuoi.</li>
      </ul>

      <h2>Per strada</h2>
      <ul>
        <li>Si cammina. Non si corre in strada, non si attraversa fuori dalle strisce, mai binari, ponti, cantieri o bordi d&apos;acqua.</li>
        <li>Rispetta il codice della strada. Niente auto o moto per scappare o inseguire.</li>
        <li>Non entrare in proprietà private, cortili chiusi o edifici recintati o pericolanti. Entrare in un edificio privato senza permesso è reato, oltre che pericoloso.</li>
        <li>Niente alcol o sostanze durante la partita.</li>
        <li>Tieni il telefono carico e la batteria sopra il 20%.</li>
      </ul>

      <h2>Con chi non gioca</h2>
      <ul>
        <li>Non spaventare, inseguire o coinvolgere passanti che non hanno accettato. Le missioni con sconosciuti si fanno solo chiedendo e solo se dicono sì.</li>
        <li>Voce bassa dove la gente dorme.</li>
        <li>Nelle foto e nei video non riprendere persone riconoscibili che non giocano senza il loro permesso.</li>
      </ul>

      <h2>Contenuti</h2>
      <ul>
        <li>Niente contenuti illegali, violenti verso persone reali, sessuali o offensivi in foto, video, vocali e messaggi.</li>
        <li>L&apos;organizzatore può togliere dalla partita chi non rispetta le regole.</li>
      </ul>

      <h2>Se qualcosa va storto</h2>
      <ul>
        <li>Usa il pulsante <b>SOS</b> in alto: tutti ricevono la tua posizione esatta e la partita va in pausa.</li>
        <li>Per un&apos;emergenza vera chiama il <a href="tel:112">112</a>: l&apos;SOS dell&apos;app non avvisa i soccorsi.</li>
        <li>Prima di partire decidete un punto di ritrovo e un orario di fine.</li>
      </ul>

      <p className="muted small">Vedi anche la <Link href="/privacy">privacy</Link>.</p>
    </main>
  );
}
