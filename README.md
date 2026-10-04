# Cirenaica Night Hunt

Web app (PWA) per la caccia notturna di Halloween nel quartiere Cirenaica, Bologna.
Cercatori contro coppie di fuggiaschi. Next.js 16 + Postgres (Neon) + Vercel Blob per foto e video.

## Avvio locale

```bash
npm install
vercel env pull .env.local --yes   # DATABASE_URL e BLOB_READ_WRITE_TOKEN dal progetto Vercel
npm run db:setup                   # crea le tabelle (con -- --fresh cancella tutto)
npm run dev
```

## Come si gioca

Non c'è una pagina admin. Chiunque apre il link può **creare una partita** scegliendo zona (Cirenaica, San Donato, Bolognina, Santo Stefano) e tipo di missioni (**Chill** o **Posti abbandonati**), poi condivide il codice di 5 lettere. Chi la crea è l'organizzatore: dal pannello (corona in alto) cambia durata, vantaggio e raggio del cerchio, mette in pausa, termina, vede i codici di rientro ed espelle. Chi arriva a partita iniziata la segue da spettatore.

1. Ognuno apre il link, scrive il **nome** e sceglie **Cercatore** o **Fuggiasco** (in 10 giocatori: consigliati 2 cercatori e 8 fuggiaschi, oppure 4 e 6).
2. Quando ci sono tutti, qualcuno tiene premuto **Estrai le coppie**: i fuggiaschi vengono accoppiati a sorte, ogni coppia riceve un nome e ogni fuggiasco una password segreta. Se qualcuno entra o cambia ruolo dopo, l'estrazione si rifà.
3. Qualcuno tiene premuto **Avvia la partita**: 10 minuti di vantaggio ai fuggiaschi, poi 70 di caccia.
4. **Fuggiaschi**: fanno le 14 missioni in giro per la Cirenaica. Ogni missione è una **foto o un video** da fare sul posto (entro 40 m). Appena la prova è inviata, i punti vanno alla coppia.
5. **Cercatori**: toccano un fuggiasco, lui dice la password, il cercatore la scrive in **Cattura** e ruba i punti.
   Sulla mappa vedono sempre ogni fuggiasco come un **cerchio di 80 m** (il fuggiasco è da qualche parte dentro, il cerchio si sposta una volta al minuto). La carta Nebbia nasconde la coppia, la carta Eco aggiunge un cerchio finto.
6. Fine al tempo scaduto o quando sono tutti presi. Si vedono classifica e **album di tutte le prove**. Da lì si può iniziare una nuova partita con gli stessi giocatori.

Ogni giocatore ha un **codice di rientro** di 4 lettere (nella lobby e nell'HUD) per rientrare da un altro telefono o dopo aver chiuso il browser.

## Dove cambiare le cose

Tutto in `src/lib/config.ts`:

- `ZONES`: le zone con confine e missioni (`abandoned: true` per i posti abbandonati).
- `LIVE_OPTIONS`, `HEAD_START_OPTIONS`, `RADIUS_OPTIONS`: le scelte che l'organizzatore ha in lobby.
- `HEAD_START_MIN`, `LIVE_MIN`, `SEED_POOL`: durate e punti iniziali.
- `WHATSAPP_URL`: link al gruppo per le contestazioni (vuoto = pulsante nascosto).

## Privacy delle prove

Foto e video sono in uno store Blob **privato**. Durante la partita li vedono solo i fuggiaschi (nel canale Fuggiaschi). I cercatori li vedono solo a fine partita. Ogni accesso passa da `/api/media/[id]`, che controlla chi chiede e rimanda a un link firmato valido 15 minuti.

## Note tecniche

- Aggiornamenti via polling ogni 3 s.
- Punti e catture passano da un registro append-only (`ledger`).
- Il GPS si ferma a schermo spento (soprattutto su iPhone): l'app chiede di tenere lo schermo acceso.
- Mappa: MapLibre con stile CARTO dark-matter. Il worker di MapLibre viene copiato in `public/maplibre` da `npm run copy:maplibre` (in automatico su install e build).
