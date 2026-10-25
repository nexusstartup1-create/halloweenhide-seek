// Everything about the evening that is fixed in code: there is no admin page.
type LngLat = [number, number];

/** Defaults for a new game; the host can change them in the lobby (options below). */
export const HEAD_START_MIN = 10;
export const LIVE_MIN = 70;
export const LIVE_OPTIONS = [45, 60, 70, 90, 120];
export const HEAD_START_OPTIONS = [5, 10, 15];
export const RADIUS_OPTIONS = [50, 80, 120, 150];
export type MissionsMode = "chill" | "abbandonati";
export const SEED_POOL = 1500;
/** Extra points a hunter earns per capture on top of what they steal, so poor pairs are still worth chasing. */
export const CAPTURE_BOUNTY = 300;
/** Flash missions: every FLASH_EVERY_MIN of live play one mission is worth FLASH_MULT× for FLASH_LEN_MIN. */
export const FLASH_EVERY_MIN = 20;
export const FLASH_LEN_MIN = 10;
export const FLASH_MULT = 2;
/**
 * Hunters always see each active fugitive as a circle of ZONE_RADIUS_M that follows them in real time.
 * The fugitive is somewhere inside it: the centre is shifted from the real spot by a random offset
 * (up to ZONE_MAX_OFFSET_M) that changes only once every ZONE_REFRESH_S, the same for every hunter,
 * so the circle can't be averaged back to the exact position.
 */
export const ZONE_RADIUS_M = 80;
export const ZONE_MAX_OFFSET_M = 55;
export const ZONE_REFRESH_S = 60;
/** A host who hasn't opened the app for this long can be replaced by anyone. */
export const HOST_STALE_MIN = 5;
/** Link to the organizers' WhatsApp group for disputes. Empty hides the button. */
export const WHATSAPP_URL = "";

/**
 * Play area: Via Massarenti to the south, the railway to the north (Bologna–Portomaggiore
 * line on the east side), Viale Ercolani to the west. Traced from OpenStreetMap.
 */
export const BOUNDARY: LngLat[] = [
  [11.3575, 44.4941],
  [11.358, 44.4978],
  [11.36, 44.4988],
  [11.3652, 44.4994],
  [11.37, 44.4977],
  [11.3735, 44.4958],
  [11.3748, 44.4936],
  [11.3715, 44.4931],
  [11.3666, 44.4926],
  [11.364, 44.4922],
  [11.3614, 44.4929],
  [11.359, 44.4936],
];

export const PAIR_NAMES = [
  "I Pipistrelli", "Le Lapidi", "Le Lanterne", "I Ragni", "Le Civette", "I Lupi Mannari", "Le Mummie", "I Corvi",
  "Le Streghe", "I Vampiri", "Gli Scheletri", "Le Zucche", "I Gatti Neri", "Le Banshee", "I Golem", "Le Ombre",
  "I Licantropi", "Le Arpie", "Gli Zombie", "I Gargoyle", "Le Falene", "I Becchini", "Le Candele", "I Teschi",
];
/** Name for a fugitive drawn alone when the count is odd. */
export const SOLO_NAME = "Il Lupo Solitario";

export const PASSWORD_WORDS = [
  "ZUCCA", "CIMITERO", "STREGA", "LAPIDE", "CORVO", "MUMMIA", "LANTERNA", "RAGNO",
  "VAMPIRO", "FANTASMA", "SCHELETRO", "PIPISTRELLO", "RAGNATELA", "CRIPTA", "GUFO", "LUPO",
];

export type MediaKind = "PHOTO" | "VIDEO";

/** Card unlocked by completing a mission (given to whoever uploads the proof). */
export type MissionReward = "ZOMBIE" | "GHOST_SHIELD" | "ECO";

export interface Mission {
  id: string;
  title: string;
  place: string;
  lat: number;
  lng: number;
  radiusM: number;
  kind: MediaKind;
  task: string;
  points: number;
  /** Abandoned or disused place: photographed from the street only. */
  abandoned?: boolean;
  reward?: MissionReward;
  /**
   * Missions with no fixed place, valid in every zone. AMBUSH: only counts if a hunter is really
   * within radiusM of you when you upload. STREET: anywhere inside the zone, with consenting passers-by.
   */
  special?: "AMBUSH" | "STREET";
}

const R = 40;

/** Coordinates from OpenStreetMap (Nominatim). Points scale with distance from the centre and exposure (total 9,200). */
export const MISSIONS: Mission[] = [
  {
    id: "umarells", title: "Gli Umarells non muoiono mai", place: "Piazzetta degli Umarells",
    lat: 44.49539, lng: 11.36637, radiusM: R, kind: "VIDEO", points: 500,
    task: "Video di 20 secondi: uno è l'umarell morto nel 1987 che non ha mai smesso di controllare i lavori. L'altro lo intervista come in un documentario true crime: com'è morto, chi è stato, perché è ancora qui. Se ridete, si rifà.",
  },
  {
    id: "guccini", title: "Via Paolo Fabbri 43", place: "Via Paolo Fabbri 43",
    lat: 44.49491, lng: 11.36299, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto con il civico 43 ben leggibile: uno è il fantasma di un cantautore che non ha mai finito la sua ultima canzone, sguardo perso nel vuoto; l'altro gli regge il microfono (il telefono). È una casa privata: zero rumore, niente citofoni.",
  },
  {
    id: "mercato", title: "Mercato delle anime", place: "Mercato Cirenaica, Via Sante Vincenzi 12/2",
    lat: 44.49605, lng: 11.36386, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto: uno vende la propria anima all'altro. Il prezzo va scritto (foglio o schermo del telefono) e mostrato in camera. Il compratore deve avere la faccia di chi sa di aver appena fatto un affare terribile.",
  },
  {
    id: "dehon", title: "Ultimo atto", place: "Teatro Dehon, Via Libia 59",
    lat: 44.49664, lng: 11.36592, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 20 secondi in un'unica ripresa davanti al teatro: uno legge ad alta voce il necrologio dell'altro, scritto sul momento, con una causa di morte assurda ma credibile. Il \"defunto\" ascolta immobile. Inchino finale.",
  },
  {
    id: "suffragio", reward: "GHOST_SHIELD", title: "Anime del Suffragio", place: "Chiesa di Santa Maria del Suffragio",
    lat: 44.49556, lng: 11.36724, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto in silhouette davanti alla facciata, nessuna faccia visibile: dovete sembrare due figure comparse in una foto d'epoca che nessuno ricorda di aver scattato. Restate fuori dalla chiesa, con rispetto.",
  },
  {
    id: "fanciullo", title: "Non voltarti", place: "Villaggio del Fanciullo",
    lat: 44.49523, lng: 11.36947, radiusM: R, kind: "PHOTO", points: 500,
    task: "Uno resta di spalle, immobile come una statua, con la torcia spenta. L'altro si allontana di 20 passi nel buio e torna senza farsi sentire, fino a fermarsi a un passo da lui. Foto dal punto di vista di chi arriva, un attimo prima che la statua si accorga.",
  },
  {
    id: "sanvitale", title: "Ultimo treno per l'aldilà", place: "Stazione San Vitale",
    lat: 44.49601, lng: 11.37226, radiusM: R, kind: "VIDEO", points: 900,
    task: "Video di 15 secondi dal piazzale o dalla banchina, sempre lontani dai binari: uno annuncia con voce da altoparlante l'ultimo treno per l'aldilà, in ritardo di 666 minuti. L'altro è il passeggero disperato che l'ha appena perso.",
  },
  {
    id: "brevi", reward: "ECO", title: "Qualcuno dietro l'albero", place: "Giardino Padre Giovanni Brevi",
    lat: 44.49714, lng: 11.36995, radiusM: R, kind: "PHOTO", points: 700,
    task: "Uno si nasconde nel buio del giardino mentre l'altro conta fino a 30 a occhi chiusi, poi lo cerca solo con la torcia del telefono. Foto del momento in cui la luce lo trova. Chi cerca cammina, non corre.",
  },
  {
    id: "benedetto", reward: "ZOMBIE", title: "Marcia degli zombie", place: "Giardino Benedetto XV",
    lat: 44.49715, lng: 11.36618, radiusM: R, kind: "VIDEO", points: 500,
    task: "Video di 20 secondi con il telefono appoggiato a terra: siete due zombie che hanno appena sentito l'odore di un vivo. Partite lontani e lentissimi, poi avanzate verso la camera sempre più affamati. Grugniti obbligatori, correre vietato.",
  },
  {
    id: "giusti", title: "Storie vere", place: "Giardino Lorenzo Giusti",
    lat: 44.49865, lng: 11.36061, radiusM: R, kind: "PHOTO", points: 900,
    task: "Torcia sotto il mento: uno racconta all'altro la cosa più inquietante che gli sia successa davvero. Foto della faccia di chi ascolta nel momento peggiore del racconto.",
  },
  {
    id: "susini", title: "Scena del crimine", place: "Giardino Giancarlo Susini",
    lat: 44.49528, lng: 11.36069, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto: uno è il cadavere steso sul prato a forma di C, l'altro il detective che fotografa la scena per il fascicolo, con la torcia puntata sul corpo. Bonus morale se trovate un rametto da usare come arma del delitto.",
  },
  {
    id: "cavallina", title: "L'urlo muto", place: "Giardino Ponte Fossa Cavallina",
    lat: 44.493, lng: 11.36627, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 15 secondi: uno fissa un punto nel buio dietro la telecamera e lentamente si terrorizza, fino all'urlo di Munch senza fare nessun suono. Chi riprende non può voltarsi a guardare: se si gira, si rifà.",
  },
  {
    id: "biavati", reward: "ZOMBIE", title: "Resurrezione", place: "Giardino Oreste Biavati",
    lat: 44.49357, lng: 11.36885, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto: uno è morto da tre giorni, steso sul prato a braccia incrociate. L'altro lo riporta in vita con un rito inventato sul momento, parole e gesti. Scattate nell'istante in cui il morto apre gli occhi... e non è più lui.",
  },
  {
    id: "massarenti234", reward: "ZOMBIE", title: "La casa di Via Massarenti", place: "Edificio abbandonato, Via Massarenti 234",
    lat: 44.49366, lng: 11.37339, radiusM: R, kind: "VIDEO", points: 1000, abandoned: true,
    task: "Video di 20 secondi, dentro o fuori, decidete voi: uno urla con tutto il fiato \"Fantasmi, leccatemi sto cazzo!\", poi 5 secondi di silenzio totale ad ascoltare se qualcuno risponde. Poi il secondo urlo, ancora più forte: quello di chi ha sentito qualcosa davvero.",
  },
  {
    id: "gallerani", title: "Visione notturna", place: "Giardino Ubaldo Gallerani",
    lat: 44.49275, lng: 11.36453, radiusM: R, kind: "PHOTO", points: 800,
    task: "Tre minuti di buio vero: torce spente, seduti schiena contro schiena in un angolo del giardino, in silenzio. Ogni rumore che sentite va nominato sottovoce. Alla fine, foto con il flash in faccia all'altro: la sua espressione è la prova.",
  },
];

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;

/* ---------------- San Donato ---------------- */

/**
 * Play area north of the railway: from the Via Libia bridge and Villaggio dei Ferrovieri up to the
 * Fiera district (Viale Aldo Moro). Traced from OpenStreetMap.
 */
export const SANDONATO_BOUNDARY: LngLat[] = [
  [11.3562, 44.501],
  [11.3563, 44.5065],
  [11.358, 44.5102],
  [11.36, 44.5113],
  [11.3645, 44.5113],
  [11.37, 44.5098],
  [11.3755, 44.5092],
  [11.379, 44.508],
  [11.3818, 44.505],
  [11.3818, 44.4997],
  [11.376, 44.499],
  [11.373, 44.4986],
  [11.369, 44.499],
  [11.3655, 44.4999],
  [11.36, 44.5004],
];

export const SANDONATO_MISSIONS: Mission[] = [
  {
    id: "sd-mercato", title: "Pozione al mercato", place: "Mercato San Donato, Via San Donato",
    lat: 44.5028, lng: 11.36291, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto: uno ha appena bevuto la pozione dell'altro e si sta trasformando, mani ad artiglio e smorfia a metà tra dolore e piacere. La strega lo guarda soddisfatta, già pronta a prendere appunti.",
  },
  {
    id: "sd-lennon", reward: "ECO", title: "Concerto spettrale", place: "Giardino Charlie Parker – John Lennon",
    lat: 44.5038, lng: 11.35717, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 20 secondi: due fantasmi cantano \"Imagine\" senza sapere di essere morti. A metà canzone uno dei due se ne accorge, e da lì non riesce più a cantare.",
  },
  {
    id: "sd-geologico", reward: "GHOST_SHIELD", title: "Pietrificati", place: "Giardino Geologico \"Sandra Forni\"",
    lat: 44.5078, lng: 11.36655, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto tra le rocce: la Medusa vi ha visti. Uno è pietrificato a metà fuga, l'altro è la Medusa che sta per voltarsi verso la camera. Chi guarda la foto deve sentirsi il prossimo.",
  },
  {
    id: "sd-province", title: "Il rito delle otto province", place: "Monumento \"Le 8 province\", Piazza Renzo Imbeni",
    lat: 44.50841, lng: 11.3648, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 20 secondi: camminate in cerchio attorno al monumento evocando un demone per ogni provincia. All'ottava il demone risponde: uno dei due deve parlare con una voce che non è la sua, finché l'altro non lo scaccia.",
  },
  {
    id: "sd-donbosco", title: "Notte da lupi", place: "Parco Don Giovanni Bosco",
    lat: 44.5077, lng: 11.36254, radiusM: R, kind: "PHOTO", points: 600,
    task: "Il primo che crolla perde: faccia a faccia, a dieci centimetri, in silenzio, finché uno dei due non scoppia a ululare o a ridere. Foto del momento esatto in cui crolla.",
  },
  {
    id: "sd-addarii", reward: "ZOMBIE", title: "Zombie al rallentatore", place: "Giardino Francesco Addarii",
    lat: 44.50187, lng: 11.36507, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 20 secondi, un'unica ripresa: uno cammina tranquillo, l'altro lo segue da zombie. Quando il primo si gira, lo zombie deve restare immobile (come a \"un, due, tre, stella\"). Se lo becca mentre si muove, si rifà.",
  },
  {
    id: "sd-cervi", title: "L'esorcismo", place: "Giardino Gino Cervi",
    lat: 44.50354, lng: 11.37252, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto: uno è posseduto, l'altro lo esorcizza con una bottiglietta d'acqua e una croce fatta con due rametti. Scattate nel momento di massima tensione: deve sembrare che il demone stia vincendo.",
  },
  {
    id: "sd-beolco", title: "L'asta delle anime", place: "Mercato di Via Beolco",
    lat: 44.50299, lng: 11.37452, radiusM: R, kind: "VIDEO", points: 900,
    task: "Video di 20 secondi a voce bassa (lì attorno la gente dorme): uno è il banditore che mette all'asta l'anima dell'altro, elencandone i peccati veri ma presentabili. Aggiudicata al prezzo più basso.",
  },
  {
    id: "sd-savena", title: "Rigore contro la Morte", place: "Campo Savena, Via della Torretta",
    lat: 44.50028, lng: 11.36667, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto: uno è il portiere, l'altro la Morte che calcia il rigore decisivo. Scattate nell'istante del tiro: la faccia del portiere deve dire che sa già che non lo parerà.",
  },
  {
    id: "sd-spinelli", title: "L'interrogatorio", place: "Giardino Altiero Spinelli",
    lat: 44.50961, lng: 11.35983, radiusM: R, kind: "PHOTO", points: 900,
    task: "Foto da sopra la spalla di chi interroga: uno è il mostro appena catturato, l'altro lo interroga con la torcia puntata in faccia. Il mostro deve avere l'aria di chi sa qualcosa che voi non sapete.",
  },
  {
    id: "sd-seferis", title: "Poeta maledetto", place: "Giardino Giorgos Seferis",
    lat: 44.50831, lng: 11.35752, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 20 secondi: una poesia d'amore horror improvvisata, dedicata all'altro guardandolo negli occhi. Rima obbligatoria con \"cimitero\". Chi distoglie lo sguardo rifà.",
  },
  {
    id: "sd-fassa", title: "Il treno cieco", place: "Campo Giorgio Fassa, Villaggio dei Ferrovieri",
    lat: 44.5087, lng: 11.37294, radiusM: R, kind: "PHOTO", points: 900,
    task: "Prova di fiducia sul prato, lontano da strade e ostacoli: uno chiude gli occhi e si fa guidare dall'altro solo con la voce per 20 passi, mano sulla spalla. Foto finale del passeggero che apre gli occhi e scopre dove l'avete portato.",
  },
  // ---- Abandoned and disused places (from OpenStreetMap and public sources). ----
  {
    id: "sd-affari", title: "Il palazzo vuoto", place: "Palazzo degli Affari, Piazza della Costituzione",
    lat: 44.51073, lng: 11.36203, radiusM: R, kind: "VIDEO", points: 1000, abandoned: true,
    task: "Ex sede della Camera di Commercio, vuota dal 2021. Video di 20 secondi, dentro o fuori, decidete voi: siete gli ultimi due impiegati e vi licenziate davanti ai fantasmi dell'ufficio, con tutte le parolacce che vi siete tenuti dentro per anni. Chiude l'altro con un urlo che faccia tremare i vetri.",
  },
  {
    id: "sd-pozzo", title: "Il pozzo senz'acqua", place: "Pozzo storico, Giardino del Casalone",
    lat: 44.5074, lng: 11.37723, radiusM: R, kind: "PHOTO", points: 900, abandoned: true,
    task: "Un vecchio pozzo ormai asciutto. Si sporge la voce, non il corpo: uno urla nel pozzo l'insulto peggiore che ha per i morti là sotto, poi avvicina l'orecchio al bordo e aspetta la risposta. Foto della sua faccia mentre ascolta.",
  },
  {
    id: "sd-ruderi-nord", title: "I ruderi del Terrapieno", place: "Ruderi, Via del Terrapieno 24",
    lat: 44.50462, lng: 11.38092, radiusM: R, kind: "PHOTO", points: 1100, abandoned: true,
    task: "Dentro o fuori, decidete voi. Prova di coraggio: uno resta da solo tra i ruderi, torcia spenta e fermo dov'è, per 60 secondi contati ad alta voce, mentre l'altro aspetta a 20 passi. Ogni dieci secondi deve gridare un insulto ai fantasmi. Foto col flash allo scadere del minuto.",
  },
  {
    id: "sd-ruderi-sud", reward: "ZOMBIE", title: "La casa senza tetto", place: "Ruderi, Via del Terrapieno 15",
    lat: 44.50043, lng: 11.38089, radiusM: R, kind: "VIDEO", points: 1100, abandoned: true,
    task: "Video di 20 secondi, dentro o fuori, decidete voi: seduta spiritica di sfida. Chiamate per nome il vecchio padrone di casa (inventatelo), ditegli che la casa adesso è vostra e che venga a riprendersela se ha le palle. Chiudete con un urlo a due voci.",
  },
  {
    id: "sd-bici", title: "L'officina dei fantasmi", place: "Stazione di riparazione bici abbandonata",
    lat: 44.50453, lng: 11.3672, radiusM: R, kind: "PHOTO", points: 600, abandoned: true,
    task: "Una stazione per riparare le bici lasciata a sé stessa. Foto: uno sta rubando la bici invisibile di un fantasma, l'altro è il fantasma e gli urla dietro \"Ridammela, pezzo di merda!\" con la faccia di chi è morto da cent'anni e non ha più pazienza.",
  },
];

/* ---------------- Bolognina ---------------- */

/** North of the station: from the railway to Via Ferrarese, Piazza Lucio Dalla to the ex Caserma Sani. */
export const BOLOGNINA_BOUNDARY: LngLat[] = [
  [11.339, 44.5045],
  [11.339, 44.5128],
  [11.343, 44.5162],
  [11.352, 44.5168],
  [11.358, 44.5168],
  [11.359, 44.512],
  [11.356, 44.506],
  [11.348, 44.5042],
];

export const BOLOGNINA_MISSIONS: Mission[] = [
  {
    id: "bo-unita", title: "Il comizio dei morti", place: "Piazza dell'Unità",
    lat: 44.51061, lng: 11.34656, radiusM: R, kind: "VIDEO", points: 500,
    task: "Video di 20 secondi: uno fa un comizio elettorale per gli spettri di Bolognina, con promesse sempre più inquietanti. L'altro è la folla: applausi, fischi e, alla fine, la rivolta dei morti contro il candidato.",
  },
  {
    id: "bo-zucca", title: "Zucche nel Parco della Zucca", place: "Parco della Zucca",
    lat: 44.51301, lng: 11.35037, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto: uno ha la testa intagliata come una zucca (mani a zucca sopra la testa, torcia dietro), l'altro la sta svuotando con un cucchiaio immaginario e grande soddisfazione. Nel parco c'è il Museo per la Memoria di Ustica: fate la foto lontano da lì, per rispetto.",
  },
  {
    id: "bo-lineare", title: "Galleria dei mostri", place: "Parco Artistico Lineare",
    lat: 44.50923, lng: 11.35196, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 20 secondi in un'unica ripresa: uno è una statua che si muove solo quando l'altro non guarda. Il critico d'arte commenta l'opera, si gira, si rigira: ogni volta la statua è più vicina.",
  },
  {
    id: "bo-albani", title: "Il patto", place: "Mercato di Via Albani",
    lat: 44.51029, lng: 11.34402, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto: uno compra dall'altro un oggetto maledetto (una cosa vera che avete in tasca) e firma il contratto \"col sangue\": pennarello rosso o ketchup. Foto della stretta di mano, faccia di chi ha già capito di aver sbagliato.",
  },
  {
    id: "bo-dalla", title: "Attenti al lupo", place: "Piazza Lucio Dalla",
    lat: 44.51095, lng: 11.33984, radiusM: R, kind: "VIDEO", points: 900,
    task: "Video di 15 secondi: uno canta il ritornello di \"Attenti al lupo\" sempre più piano, mentre l'altro, nel buio alle sue spalle, ulula sempre più vicino. Finisce quando chi canta si gira.",
  },
  {
    id: "bo-testoni", reward: "ZOMBIE", title: "Burattini zombie", place: "Teatro Testoni Ragazzi, Via Matteotti",
    lat: 44.50803, lng: 11.34601, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto: uno è il burattinaio, l'altro il burattino zombie che si muove con fili invisibili. Il burattinaio gli fa fare la cosa più imbarazzante che vi viene in mente, purché legale.",
  },
  {
    id: "bo-puccini", title: "Trailer dell'orrore", place: "Arena Puccini, Via Serlio",
    lat: 44.50693, lng: 11.35175, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 25 secondi in stile found footage: telecamera tremante, respiro affannato, qualcuno che chiede \"l'hai sentito anche tu?\". L'ultima inquadratura deve mostrare qualcosa che non si capisce cosa sia.",
  },
  {
    id: "bo-trombetti", reward: "GHOST_SHIELD", title: "La panchina dei fantasmi", place: "Giardino Gustavo Trombetti",
    lat: 44.50854, lng: 11.35356, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto scattata da cinque metri: seduti ai due lati della panchina, con un posto vuoto in mezzo. Uno parla al fantasma seduto lì, l'altro è sempre più a disagio. Deve sembrare che la foto l'abbia scattata il fantasma.",
  },
  {
    id: "bo-barbalonga", title: "La danza macabra", place: "Giardino Aurelio Barbalonga",
    lat: 44.51374, lng: 11.3555, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 15 secondi: un lento guancia a guancia, scheletrico e romanticissimo, senza musica. Chi ride per primo è morto: si rifà finché non resistete fino alla fine.",
  },
  {
    id: "bo-guidorossa", reward: "ECO", title: "Ombre al confine", place: "Giardino Guido Rossa",
    lat: 44.51604, lng: 11.35321, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto delle sole ombre proiettate a terra da un lampione: un'ombra sta strangolando l'altra, ma i vostri corpi restano a un metro di distanza. Solo le ombre si toccano.",
  },
  {
    id: "bo-luzzatto", title: "Il giardino dei corvi", place: "Giardino Elena Luzzatto",
    lat: 44.51242, lng: 11.33983, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto: uno resta immobile come un corvo appollaiato mentre l'altro gli sussurra all'orecchio la cosa più inquietante che riesce a inventare. Scattate quando il corvo non ce la fa più.",
  },
  {
    id: "bo-bersani", title: "Sepolti vivi", place: "Giardino Giovanni Bersani",
    lat: 44.51113, lng: 11.35564, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto dall'alto: sdraiati sul prato fianco a fianco, braccia incrociate come in una bara, foglie e rametti addosso. Dovete sembrare dimenticati lì da giorni.",
  },
  {
    id: "bo-sani", reward: "ZOMBIE", title: "La caserma fantasma", place: "Ex Caserma Sani, Via Ferrarese 199",
    lat: 44.51576, lng: 11.35472, radiusM: R, kind: "VIDEO", points: 1100, abandoned: true,
    task: "Ex caserma dismessa con 26 edifici e due silos. Video di 20 secondi, dentro o fuori, decidete voi: siete i nuovi sergenti e fate l'adunata del plotone fantasma, insultandoli come in un film di guerra. Al \"Riposo!\" finale, un urlo che si senta fino ai silos.",
  },
];

/* ---------------- Santo Stefano ---------------- */

/** South-east of the centre: from the Two Towers down to the Giardini Margherita, Porta Castiglione to Viale Carducci. */
export const SANTOSTEFANO_BOUNDARY: LngLat[] = [
  [11.3432, 44.4947],
  [11.356, 44.4947],
  [11.3602, 44.4905],
  [11.3606, 44.486],
  [11.3572, 44.4814],
  [11.347, 44.4814],
  [11.3432, 44.4842],
];

export const SANTOSTEFANO_MISSIONS: Mission[] = [
  {
    id: "ss-torri", title: "Reggere la torre", place: "Due Torri, Piazza di Porta Ravegnana",
    lat: 44.4943, lng: 11.34678, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto con la prospettiva giusta: la Garisenda cade adesso. Uno la regge con tutte le forze, l'altro ha già deciso di salvarsi e scappa lasciandolo lì. Foto di un tradimento.",
  },
  {
    id: "ss-stefano", reward: "ZOMBIE", title: "Le sette chiese", place: "Piazza Santo Stefano",
    lat: 44.49203, lng: 11.34872, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto sotto i portici: due figure incappucciate in fila, testa bassa, come una processione silenziosa. Nella foto deve sembrare che ci sia una terza figura in fondo al portico. Piazza sacra: silenzio vero.",
  },
  {
    id: "ss-servi", title: "La processione dei Servi", place: "Portico dei Servi, Strada Maggiore",
    lat: 44.49237, lng: 11.35185, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 20 secondi sotto il portico, in silenzio totale: uno cammina davanti, l'altro dietro. Ogni dieci passi chi sta davanti si gira di scatto: se vede l'altro muoversi, si ricomincia da capo.",
  },
  {
    id: "ss-morandi", title: "Natura morta", place: "Via Fondazza 36, casa di Giorgio Morandi",
    lat: 44.48925, lng: 11.35513, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto: componete una natura morta alla Morandi con gli oggetti che avete addosso (bottiglia, telefono, scarpa) e mettetevi immobili accanto, grigi e spenti, come parte del quadro. È una via abitata: zero rumore.",
  },
  {
    id: "ss-carducci", title: "Pianto antico", place: "Monumento a Giosuè Carducci",
    lat: 44.48773, lng: 11.35729, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 15 secondi: declamate i primi versi di \"Pianto antico\", ma uno dei due deve piangere davvero, o fingere benissimo. Il pianto più credibile della serata vince la gloria eterna.",
  },
  {
    id: "ss-portass", title: "I guardiani della porta", place: "Porta Santo Stefano",
    lat: 44.48481, lng: 11.35641, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto: per passare dalla porta bisogna pagare un pedaggio. Uno è il guardiano non-morto, l'altro gli consegna qualcosa di vero che ha in tasca, con la faccia di chi non lo rivedrà mai più.",
  },
  {
    id: "ss-dubcek", title: "Mezzanotte", place: "Giardino Dubček",
    lat: 44.49025, lng: 11.35349, radiusM: R, kind: "PHOTO", points: 500,
    task: "Puntate una sveglia a un minuto da adesso e fissatevi negli occhi in silenzio finché non suona. Foto nell'istante in cui suona e uno dei due \"muore\" sul colpo.",
  },
  {
    id: "ss-laghetto", title: "La creatura del lago", place: "Laghetto dei Giardini Margherita",
    lat: 44.48379, lng: 11.35285, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 15 secondi: uno racconta la leggenda della creatura del lago guardando l'acqua, con la camera alle sue spalle. Lentamente, l'altro entra nell'inquadratura dal buio come creatura. Restate lontani dal bordo e controllate gli orari di apertura dei Giardini.",
  },
  {
    id: "ss-castiglione", reward: "ECO", title: "La porta delle streghe", place: "Porta Castiglione",
    lat: 44.48554, lng: 11.34827, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto sotto l'arco: due streghe al decollo, scopa (o ramo, o ombrello) tra le gambe, scattata a mezz'aria nel salto. La porta è su una strada trafficata: restate sotto l'arco, lontani dalle macchine.",
  },
  {
    id: "ss-domenico", title: "Le arche dei glossatori", place: "Piazza San Domenico",
    lat: 44.48988, lng: 11.34408, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto davanti alle arche, senza toccarle: avvolti in sciarpe e giacche, siete due mummie appena svegliate dopo 800 anni, accecate dalla torcia. Sono monumenti: rispetto.",
  },
  {
    id: "ss-duse", reward: "GHOST_SHIELD", title: "Il fantasma del teatro", place: "Teatro Duse, Via Cartoleria",
    lat: 44.48864, lng: 11.34837, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 20 secondi di scena muta: il fantasma del teatro recita la sua ultima battuta senza voce, l'altro è l'unico spettatore rimasto, piange e applaude finché il fantasma esce dall'inquadratura per sempre.",
  },
  {
    id: "ss-masini", title: "La caserma occupata", place: "Ex Caserma Masini, Via Orfeo 46",
    lat: 44.48557, lng: 11.35335, radiusM: R, kind: "PHOTO", points: 1000, abandoned: true,
    task: "Ex caserma dismessa. Dentro o fuori, decidete voi. Foto col timer: siete due sentinelle che hanno appena visto qualcosa nel buio, uno punta la torcia e l'altro urla a bocca spalancata. Deve sembrare l'ultima foto ritrovata in un telefono.",
  },
  {
    id: "ss-staveco", title: "La fabbrica dei carri", place: "Ex Staveco, Viale Panzacchi",
    lat: 44.48596, lng: 11.34421, radiusM: R, kind: "VIDEO", points: 1100, abandoned: true,
    task: "Qui l'esercito costruiva e riparava i mezzi corazzati. Video di 25 secondi, dentro o fuori, decidete voi: telecronaca dell'ultimo carro armato fantasma che esce dall'officina, voce da telecronista impazzito e parolacce a raffica quando vi punta. Finale: un urlo e ritirata, camminando.",
  },
  {
    id: "ss-friuli", reward: "ZOMBIE", title: "Il comando abbandonato", place: "Ex Comando Brigata Friuli, Viale Carducci",
    lat: 44.48802, lng: 11.35833, radiusM: R, kind: "PHOTO", points: 1000, abandoned: true,
    task: "Ex comando militare dismesso. Dentro o fuori, decidete voi: il generale fantasma vi ha appena degradati e voi rispondete. Foto sull'attenti: uno gli fa il gesto dell'ombrello, l'altro urla l'insulto più creativo che conosce.",
  },
];

/* ---------------- zones ---------------- */

export type ZoneKey = "cirenaica" | "sandonato" | "bolognina" | "santostefano";

export const ZONES: Record<ZoneKey, { name: string; boundary: LngLat[]; missions: Mission[] }> = {
  cirenaica: { name: "Cirenaica", boundary: BOUNDARY, missions: MISSIONS },
  sandonato: { name: "San Donato", boundary: SANDONATO_BOUNDARY, missions: SANDONATO_MISSIONS },
  bolognina: { name: "Bolognina", boundary: BOLOGNINA_BOUNDARY, missions: BOLOGNINA_MISSIONS },
  santostefano: { name: "Santo Stefano", boundary: SANTOSTEFANO_BOUNDARY, missions: SANTOSTEFANO_MISSIONS },
};

export function zoneOf(key: string | null | undefined) {
  return ZONES[(key as ZoneKey) in ZONES ? (key as ZoneKey) : "cirenaica"];
}

/** Minimum missions in "abbandonati" mode: zones with fewer abandoned places are topped up with chill ones. */
export const MIN_ABANDONED_SET = 8;

/** The missions of a game: its zone's abandoned places, or the regular ("chill") ones. */
export const SPECIAL_MISSIONS: Mission[] = [
  {
    id: "x-spalle", special: "AMBUSH", title: "Alle sue spalle", place: "Vicino a un cercatore", lat: 0, lng: 0, radiusM: 30, kind: "PHOTO", points: 1200,
    task: "Avvicinatevi di nascosto a un cercatore e fotografatelo di spalle, a meno di 30 metri, senza che se ne accorga. Se si gira e vi vede, sono affari vostri: può catturarvi. Si cammina e non ci si tocca.",
  },
  {
    id: "x-regalo", special: "AMBUSH", title: "Un regalo per te", place: "Vicino a un cercatore", lat: 0, lng: 0, radiusM: 40, kind: "PHOTO", points: 900,
    task: "Lasciate un regalo a meno di 40 metri da un cercatore senza farvi vedere, dove lo troverà: una caramella o un biglietto con scritto \"ti stiamo guardando\". Foto del regalo con il cercatore sullo sfondo. Niente che sporchi o spaventi chi non gioca.",
  },
  {
    id: "x-pedinamento", special: "AMBUSH", title: "Pedinamento", place: "Vicino a un cercatore", lat: 0, lng: 0, radiusM: 50, kind: "VIDEO", points: 1500,
    task: "Video di 15 secondi: pedinate un cercatore a meno di 50 metri e raccontate sottovoce cosa fa, come in un documentario sui predatori notturni. Finisce quando vi allontanate. Mai correre.",
  },
  {
    id: "x-dolcetto", special: "STREET", title: "Dolcetto o scherzetto", place: "Ovunque nella zona", lat: 0, lng: 0, radiusM: 0, kind: "VIDEO", points: 700,
    task: "Video di 10 secondi: offrite una caramella a un passante che ha voglia di giocare e chiedetegli il \"buuu\" più spaventoso che sa fare. Solo se accetta. Se non vuole apparire, inquadrate solo la mano con la caramella.",
  },
  {
    id: "x-testimone", special: "STREET", title: "Il testimone", place: "Ovunque nella zona", lat: 0, lng: 0, radiusM: 0, kind: "VIDEO", points: 900,
    task: "Video di 15 secondi: chiedete a un passante disponibile di raccontare la cosa più paurosa che gli sia mai successa. Solo con il suo consenso. Se preferisce non apparire, inquadrate voi e si sente solo la sua voce.",
  },
  {
    id: "x-fotografo", special: "STREET", title: "La sposina urlante", place: "Ovunque nella zona", lat: 0, lng: 0, radiusM: 0, kind: "VIDEO", points: 900,
    task: "Video di 10 secondi girato da un passante che ha voglia di giocare, col vostro telefono: uno prende l'altro in braccio a sposina e lancia l'urlo più forte che ha in corpo. Sollevate piegando le gambe, su terreno piano, fermi e senza correre. Fatelo in un parco o in una piazza, lontano dalle finestre di chi dorme.",
  },
];

/** Every mission a pair can do: the zone's places plus the ambush and street ones. */
export function allMissionsFor(zone: string | null | undefined, mode: string | null | undefined) {
  return [...missionsFor(zone, mode), ...SPECIAL_MISSIONS];
}

/** Place missions only (flash missions are picked from these). */
export function missionsFor(zone: string | null | undefined, mode: string | null | undefined) {
  const all = zoneOf(zone).missions;
  const chill = all.filter((m) => !m.abandoned);
  if (mode !== "abbandonati") return chill;
  const abandoned = all.filter((m) => m.abandoned);
  return [...abandoned, ...chill.slice(0, Math.max(0, MIN_ABANDONED_SET - abandoned.length))];
}
