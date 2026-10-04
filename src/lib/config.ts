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
 * Hunters always see each active fugitive as a circle of ZONE_RADIUS_M. The fugitive is somewhere
 * inside it (the centre is shifted at random by up to ZONE_MAX_OFFSET_M), and the circle moves only
 * once every ZONE_REFRESH_S, the same for every hunter, so it can't be averaged back to the real spot.
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
];

export const PASSWORD_WORDS = [
  "ZUCCA", "CIMITERO", "STREGA", "LAPIDE", "CORVO", "MUMMIA", "LANTERNA", "RAGNO",
  "VAMPIRO", "FANTASMA", "SCHELETRO", "PIPISTRELLO", "RAGNATELA", "CRIPTA", "GUFO", "LUPO",
];

export type MediaKind = "PHOTO" | "VIDEO";

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
}

const R = 40;

/** Coordinates from OpenStreetMap (Nominatim). Points scale with distance from the centre and exposure (total 9,200). */
export const MISSIONS: Mission[] = [
  {
    id: "umarells", title: "Gli Umarells non muoiono mai", place: "Piazzetta degli Umarells",
    lat: 44.49539, lng: 11.36637, radiusM: R, kind: "VIDEO", points: 500,
    task: "Video di 10 secondi: tutti e due mani dietro la schiena, guardate un cantiere immaginario e commentate i lavori con voce da zombie.",
  },
  {
    id: "guccini", title: "Via Paolo Fabbri 43", place: "Via Paolo Fabbri 43",
    lat: 44.49491, lng: 11.36299, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto della coppia con il civico 43 ben leggibile. Uno dei due suona una chitarra invisibile. È una casa privata: niente rumore, niente citofoni.",
  },
  {
    id: "mercato", title: "Mercato delle anime", place: "Mercato Cirenaica, Via Sante Vincenzi 12/2",
    lat: 44.49605, lng: 11.36386, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto davanti al Mercato Cirenaica: uno fa il venditore di anime, l'altro il cliente che contratta.",
  },
  {
    id: "dehon", title: "Ultimo atto", place: "Teatro Dehon, Via Libia 59",
    lat: 44.49664, lng: 11.36592, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 15 secondi davanti al Teatro Dehon: recitate il monologo più drammatico che vi viene in mente sulla vostra morte imminente. Poi inchino.",
  },
  {
    id: "suffragio", title: "Anime del Suffragio", place: "Chiesa di Santa Maria del Suffragio",
    lat: 44.49556, lng: 11.36724, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto della coppia in silhouette davanti alla facciata: nessuna faccia visibile, solo sagome. Restate fuori dalla chiesa.",
  },
  {
    id: "fanciullo", title: "Statue di pietra", place: "Villaggio del Fanciullo",
    lat: 44.49523, lng: 11.36947, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto davanti al Villaggio del Fanciullo: tutti e due immobili come statue di un cimitero, braccia incrociate sul petto.",
  },
  {
    id: "sanvitale", title: "Ultimo treno per l'aldilà", place: "Stazione San Vitale",
    lat: 44.49601, lng: 11.37226, radiusM: R, kind: "VIDEO", points: 900,
    task: "Video di 10 secondi: salutate come due fantasmi un treno immaginario che parte per l'aldilà. Restate sulla banchina, lontani dai binari.",
  },
  {
    id: "brevi", title: "Qualcuno dietro l'albero", place: "Giardino Padre Giovanni Brevi",
    lat: 44.49714, lng: 11.36995, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto: uno dei due è nascosto dietro un albero e si vede solo una mano. L'altro in primo piano non si accorge di niente.",
  },
  {
    id: "benedetto", title: "Marcia degli zombie", place: "Giardino Benedetto XV",
    lat: 44.49715, lng: 11.36618, radiusM: R, kind: "VIDEO", points: 500,
    task: "Video di 10 secondi: camminata da zombie sincronizzata, cinque passi, stessa gamba, stesso braccio.",
  },
  {
    id: "giusti", title: "Racconto da falò", place: "Giardino Lorenzo Giusti",
    lat: 44.49865, lng: 11.36061, radiusM: R, kind: "PHOTO", points: 900,
    task: "Selfie della coppia con la torcia del telefono sotto il mento, la faccia più spaventosa che avete.",
  },
  {
    id: "susini", title: "La C di Cirenaica", place: "Giardino Giancarlo Susini",
    lat: 44.49528, lng: 11.36069, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto: formate una grande lettera C con i vostri corpi. Se serve, sdraiatevi.",
  },
  {
    id: "cavallina", title: "L'urlo muto", place: "Giardino Ponte Fossa Cavallina",
    lat: 44.493, lng: 11.36627, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 8 secondi: tutti e due fate l'Urlo di Munch, bocca spalancata e mani sulle guance, senza fare nessun suono.",
  },
  {
    id: "biavati", title: "Resurrezione", place: "Giardino Oreste Biavati",
    lat: 44.49357, lng: 11.36885, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto: uno dei due è svenuto a terra, l'altro lo riporta in vita con un incantesimo. Gesti teatrali obbligatori.",
  },
  {
    id: "massarenti234", title: "La casa di Via Massarenti", place: "Edificio abbandonato, Via Massarenti 234",
    lat: 44.49366, lng: 11.37339, radiusM: R, kind: "VIDEO", points: 1000, abandoned: true,
    task: "Video di 15 secondi: davanti alla casa abbandonata, uno racconta chi ci abitava e perché se n'è andato, l'altro ascolta sempre più spaventato.",
  },
  {
    id: "gallerani", title: "Visione notturna", place: "Giardino Ubaldo Gallerani",
    lat: 44.49275, lng: 11.36453, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto della coppia con le mani a occhiali da pipistrello davanti agli occhi, guardando dritto in camera.",
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
    task: "Foto davanti al Mercato San Donato: uno fa la strega che compra gli ingredienti per una pozione, l'altro il mercante sospettoso.",
  },
  {
    id: "sd-lennon", title: "Concerto spettrale", place: "Giardino Charlie Parker – John Lennon",
    lat: 44.5038, lng: 11.35717, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 10 secondi: cantate \"Imagine\" con voce da fantasma, uno suona un sassofono invisibile per Charlie Parker.",
  },
  {
    id: "sd-geologico", title: "Pietrificati", place: "Giardino Geologico \"Sandra Forni\"",
    lat: 44.5078, lng: 11.36655, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto tra le rocce del giardino geologico: siete due mummie pietrificate da mille anni.",
  },
  {
    id: "sd-province", title: "Il rito delle otto province", place: "Monumento \"Le 8 province\", Piazza Renzo Imbeni",
    lat: 44.50841, lng: 11.3648, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 10 secondi: camminate attorno al monumento come in un rito antico, mani alzate, e nominate tre province con voce cupa.",
  },
  {
    id: "sd-donbosco", title: "Notte da lupi", place: "Parco Don Giovanni Bosco",
    lat: 44.5077, lng: 11.36254, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto: tutti e due ululate alla luna come lupi mannari, testa all'indietro e mani ad artiglio.",
  },
  {
    id: "sd-addarii", title: "Zombie al rallentatore", place: "Giardino Francesco Addarii",
    lat: 44.50187, lng: 11.36507, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 10 secondi: camminata da zombie al rallentatore, sincronizzati, verso la telecamera.",
  },
  {
    id: "sd-cervi", title: "Peppone e Don Camillo", place: "Giardino Gino Cervi",
    lat: 44.50354, lng: 11.37252, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto: uno fa Peppone e l'altro Don Camillo, ma in versione zombie, che litigano.",
  },
  {
    id: "sd-beolco", title: "Il banditore dei morti", place: "Mercato di Via Beolco",
    lat: 44.50299, lng: 11.37452, radiusM: R, kind: "VIDEO", points: 900,
    task: "Video di 10 secondi: annunciate a gran voce (ma non troppo forte, è notte) la merce del mercato dei morti.",
  },
  {
    id: "sd-savena", title: "Partita fantasma", place: "Campo Savena, Via della Torretta",
    lat: 44.50028, lng: 11.36667, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto: esultate per un gol segnato da un fantasma, braccia al cielo, davanti al campo.",
  },
  {
    id: "sd-spinelli", title: "Mostri d'Europa", place: "Giardino Altiero Spinelli",
    lat: 44.50961, lng: 11.35983, radiusM: R, kind: "PHOTO", points: 900,
    task: "Foto: formate con le braccia una stella delle bandiere europee, con la faccia più mostruosa che avete.",
  },
  {
    id: "sd-seferis", title: "Poeta maledetto", place: "Giardino Giorgos Seferis",
    lat: 44.50831, lng: 11.35752, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 15 secondi: recitate una poesia horror inventata sul momento, con pause drammatiche.",
  },
  {
    id: "sd-fassa", title: "Il treno dei ferrovieri", place: "Campo Giorgio Fassa, Villaggio dei Ferrovieri",
    lat: 44.5087, lng: 11.37294, radiusM: R, kind: "PHOTO", points: 900,
    task: "Foto: siete un trenino fantasma, uno dietro l'altro con le mani sulle spalle, nel Villaggio dei Ferrovieri.",
  },
  // ---- Abandoned and disused places (from OpenStreetMap and public sources). ----
  {
    id: "sd-affari", title: "Il palazzo vuoto", place: "Palazzo degli Affari, Piazza della Costituzione",
    lat: 44.51073, lng: 11.36203, radiusM: R, kind: "VIDEO", points: 1000, abandoned: true,
    task: "Ex sede della Camera di Commercio, vuota dal 2021. Video di 10 secondi: siete gli ultimi due impiegati rimasti chiusi dentro dal 2021 e salutate i colleghi vivi.",
  },
  {
    id: "sd-pozzo", title: "Il pozzo senz'acqua", place: "Pozzo storico, Giardino del Casalone",
    lat: 44.5074, lng: 11.37723, radiusM: R, kind: "PHOTO", points: 900, abandoned: true,
    task: "Un vecchio pozzo ormai asciutto. Foto: uno dei due guarda verso il pozzo terrorizzato, come se avesse sentito una voce dal fondo.",
  },
  {
    id: "sd-ruderi-nord", title: "I ruderi del Terrapieno", place: "Ruderi, Via del Terrapieno 24",
    lat: 44.50462, lng: 11.38092, radiusM: R, kind: "PHOTO", points: 1100, abandoned: true,
    task: "Foto: le vostre silhouette contro i ruderi, illuminate solo dalla torcia del telefono.",
  },
  {
    id: "sd-ruderi-sud", title: "La casa senza tetto", place: "Ruderi, Via del Terrapieno 15",
    lat: 44.50043, lng: 11.38089, radiusM: R, kind: "VIDEO", points: 1100, abandoned: true,
    task: "Video di 15 secondi: raccontate sottovoce la leggenda (inventata) di chi abitava qui e perché nessuno è più tornato.",
  },
  {
    id: "sd-bici", title: "L'officina dei fantasmi", place: "Stazione di riparazione bici abbandonata",
    lat: 44.50453, lng: 11.3672, radiusM: R, kind: "PHOTO", points: 600, abandoned: true,
    task: "Una stazione per riparare le bici lasciata a sé stessa. Foto: fingete di riparare la bicicletta invisibile di un fantasma impaziente.",
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
    task: "Video di 10 secondi: uno tiene un comizio per il diritto di voto dei fantasmi, l'altro applaude come una folla intera.",
  },
  {
    id: "bo-zucca", title: "Zucche nel Parco della Zucca", place: "Parco della Zucca",
    lat: 44.51301, lng: 11.35037, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto: tutti e due con le mani a forma di zucca intagliata sopra la testa. Nel parco c'è il Museo per la Memoria di Ustica: fate la foto lontano da lì, per rispetto.",
  },
  {
    id: "bo-lineare", title: "Galleria dei mostri", place: "Parco Artistico Lineare",
    lat: 44.50923, lng: 11.35196, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 10 secondi: siete due critici d'arte dell'aldilà che commentano un'opera immaginaria con voce snob.",
  },
  {
    id: "bo-albani", title: "Bancarella stregata", place: "Mercato di Via Albani",
    lat: 44.51029, lng: 11.34402, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto davanti al mercato: uno vende occhi di rospo e unghie di strega, l'altro tratta sul prezzo.",
  },
  {
    id: "bo-dalla", title: "Attenti al lupo", place: "Piazza Lucio Dalla",
    lat: 44.51095, lng: 11.33984, radiusM: R, kind: "VIDEO", points: 900,
    task: "Video di 10 secondi: cantate il ritornello di \"Attenti al lupo\" di Lucio Dalla, uno con voce da lupo mannaro.",
  },
  {
    id: "bo-testoni", title: "Burattini zombie", place: "Teatro Testoni Ragazzi, Via Matteotti",
    lat: 44.50803, lng: 11.34601, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto: uno fa il burattinaio e l'altro il burattino zombie, con i fili invisibili.",
  },
  {
    id: "bo-puccini", title: "Trailer dell'orrore", place: "Arena Puccini, Via Serlio",
    lat: 44.50693, lng: 11.35175, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 15 secondi: girate il trailer di un film horror ambientato in Bolognina, con voce fuori campo drammatica.",
  },
  {
    id: "bo-trombetti", title: "La panchina dei fantasmi", place: "Giardino Gustavo Trombetti",
    lat: 44.50854, lng: 11.35356, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto: seduti su una panchina, uno parla con un fantasma invisibile seduto in mezzo a voi.",
  },
  {
    id: "bo-barbalonga", title: "La danza macabra", place: "Giardino Aurelio Barbalonga",
    lat: 44.51374, lng: 11.3555, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 10 secondi: una danza macabra a due, lenta e scheletrica.",
  },
  {
    id: "bo-guidorossa", title: "Ombre al confine", place: "Giardino Guido Rossa",
    lat: 44.51604, lng: 11.35321, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto: solo le vostre ombre proiettate a terra dalla luce di un lampione, nella posa più spaventosa possibile.",
  },
  {
    id: "bo-luzzatto", title: "Il giardino dei corvi", place: "Giardino Elena Luzzatto",
    lat: 44.51242, lng: 11.33983, radiusM: R, kind: "PHOTO", points: 800,
    task: "Foto: siete due corvi appollaiati, braccia come ali, sguardo fisso in camera.",
  },
  {
    id: "bo-bersani", title: "Il prato delle anime", place: "Giardino Giovanni Bersani",
    lat: 44.51113, lng: 11.35564, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto: sdraiati sul prato come due anime che guardano le stelle, scattata dall'alto.",
  },
  {
    id: "bo-sani", title: "La caserma fantasma", place: "Ex Caserma Sani, Via Ferrarese 199",
    lat: 44.51576, lng: 11.35472, radiusM: R, kind: "VIDEO", points: 1100, abandoned: true,
    task: "Ex caserma dismessa con 26 edifici e due silos. Video di 15 secondi: fate l'appello di un plotone di soldati fantasma, rispondendo con voci diverse.",
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
    task: "Foto con la prospettiva giusta: uno sembra reggere la Garisenda che cade, l'altro scappa terrorizzato.",
  },
  {
    id: "ss-stefano", title: "Le sette chiese", place: "Piazza Santo Stefano",
    lat: 44.49203, lng: 11.34872, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto sotto i portici della piazza: due figure incappucciate in fila, come una processione silenziosa.",
  },
  {
    id: "ss-servi", title: "La processione dei Servi", place: "Portico dei Servi, Strada Maggiore",
    lat: 44.49237, lng: 11.35185, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 10 secondi: camminate lentamente sotto il portico come fantasmi, senza fare rumore.",
  },
  {
    id: "ss-morandi", title: "Natura morta", place: "Via Fondazza 36, casa di Giorgio Morandi",
    lat: 44.48925, lng: 11.35513, radiusM: R, kind: "PHOTO", points: 600,
    task: "Foto: immobili come le bottiglie di una natura morta di Morandi, uno accanto all'altro.",
  },
  {
    id: "ss-carducci", title: "Pianto antico", place: "Monumento a Giosuè Carducci",
    lat: 44.48773, lng: 11.35729, radiusM: R, kind: "VIDEO", points: 700,
    task: "Video di 15 secondi: declamate i primi versi di \"Pianto antico\" di Carducci con la voce più tragica che avete.",
  },
  {
    id: "ss-portass", title: "I guardiani della porta", place: "Porta Santo Stefano",
    lat: 44.48481, lng: 11.35641, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto: siete i due guardiani non-morti della porta, braccia incrociate, sguardo minaccioso.",
  },
  {
    id: "ss-dubcek", title: "L'orologio fermo", place: "Giardino Dubček",
    lat: 44.49025, lng: 11.35349, radiusM: R, kind: "PHOTO", points: 500,
    task: "Foto: uno indica un orologio invisibile fermo a mezzanotte, l'altro urla.",
  },
  {
    id: "ss-laghetto", title: "La creatura del lago", place: "Laghetto dei Giardini Margherita",
    lat: 44.48379, lng: 11.35285, radiusM: R, kind: "VIDEO", points: 800,
    task: "Video di 10 secondi: uno racconta che dal laghetto esce una creatura, l'altro la vede arrivare. Controllate gli orari di apertura dei Giardini.",
  },
  {
    id: "ss-castiglione", title: "La porta delle streghe", place: "Porta Castiglione",
    lat: 44.48554, lng: 11.34827, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto sotto l'arco della porta: due streghe che stanno per partire in volo sulla scopa.",
  },
  {
    id: "ss-domenico", title: "Le arche dei glossatori", place: "Piazza San Domenico",
    lat: 44.48988, lng: 11.34408, radiusM: R, kind: "PHOTO", points: 700,
    task: "Foto davanti alle tombe medievali in piazza: siete due mummie appena risvegliate.",
  },
  {
    id: "ss-duse", title: "Il fantasma del teatro", place: "Teatro Duse, Via Cartoleria",
    lat: 44.48864, lng: 11.34837, radiusM: R, kind: "VIDEO", points: 600,
    task: "Video di 10 secondi: il fantasma del teatro fa il suo ultimo inchino, l'altro applaude piangendo.",
  },
  {
    id: "ss-masini", title: "La caserma occupata", place: "Ex Caserma Masini, Via Orfeo 46",
    lat: 44.48557, lng: 11.35335, radiusM: R, kind: "PHOTO", points: 1000, abandoned: true,
    task: "Ex caserma dismessa. Foto: le vostre silhouette davanti al vecchio ingresso, come due sentinelle rimaste di guardia per sempre.",
  },
  {
    id: "ss-staveco", title: "La fabbrica dei carri", place: "Ex Staveco, Viale Panzacchi",
    lat: 44.48596, lng: 11.34421, radiusM: R, kind: "VIDEO", points: 1100, abandoned: true,
    task: "Qui l'esercito costruiva e riparava i mezzi corazzati. Video di 15 secondi: raccontate la leggenda (inventata) del carro armato fantasma che gira di notte.",
  },
  {
    id: "ss-friuli", title: "Il comando abbandonato", place: "Ex Comando Brigata Friuli, Viale Carducci",
    lat: 44.48802, lng: 11.35833, radiusM: R, kind: "PHOTO", points: 1000, abandoned: true,
    task: "Ex comando militare dismesso. Foto: fate il saluto militare a un generale fantasma che non c'è più.",
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
export function missionsFor(zone: string | null | undefined, mode: string | null | undefined) {
  const all = zoneOf(zone).missions;
  const chill = all.filter((m) => !m.abandoned);
  if (mode !== "abbandonati") return chill;
  const abandoned = all.filter((m) => m.abandoned);
  return [...abandoned, ...chill.slice(0, Math.max(0, MIN_ABANDONED_SET - abandoned.length))];
}
