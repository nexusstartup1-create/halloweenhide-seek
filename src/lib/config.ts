// Everything about the evening that is fixed in code: there is no admin page.
type LngLat = [number, number];

export const HEAD_START_MIN = 10;
export const LIVE_MIN = 70;
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
  // ---- Abandoned and disused places (from OpenStreetMap). Always from outside: never go in or climb fences. ----
  {
    id: "sd-affari", title: "Il palazzo vuoto", place: "Palazzo degli Affari, Piazza della Costituzione",
    lat: 44.51073, lng: 11.36203, radiusM: R, kind: "VIDEO", points: 1000, abandoned: true,
    task: "Ex sede della Camera di Commercio, vuota dal 2021. Video di 10 secondi dalla piazza: siete gli ultimi due impiegati rimasti chiusi dentro dal 2021 e salutate i colleghi vivi. Solo dalla piazza, non avvicinatevi agli ingressi.",
  },
  {
    id: "sd-pozzo", title: "Il pozzo senz'acqua", place: "Pozzo storico, Giardino del Casalone",
    lat: 44.5074, lng: 11.37723, radiusM: R, kind: "PHOTO", points: 900, abandoned: true,
    task: "Un vecchio pozzo ormai asciutto. Foto: uno dei due guarda verso il pozzo terrorizzato, come se avesse sentito una voce dal fondo. Restate a terra: non salite e non sporgetevi sul bordo.",
  },
  {
    id: "sd-ruderi-nord", title: "I ruderi del Terrapieno", place: "Ruderi, Via del Terrapieno 24",
    lat: 44.50462, lng: 11.38092, radiusM: R, kind: "PHOTO", points: 1100, abandoned: true,
    task: "Foto dal marciapiede: le vostre silhouette contro i ruderi, illuminate solo dalla torcia del telefono. Non entrate e non scavalcate recinzioni.",
  },
  {
    id: "sd-ruderi-sud", title: "La casa senza tetto", place: "Ruderi, Via del Terrapieno 15",
    lat: 44.50043, lng: 11.38089, radiusM: R, kind: "VIDEO", points: 1100, abandoned: true,
    task: "Video di 15 secondi dal marciapiede: raccontate sottovoce la leggenda (inventata) di chi abitava qui e perché nessuno è più tornato. Non entrate e non scavalcate recinzioni.",
  },
  {
    id: "sd-bici", title: "L'officina dei fantasmi", place: "Stazione di riparazione bici abbandonata",
    lat: 44.50453, lng: 11.3672, radiusM: R, kind: "PHOTO", points: 600, abandoned: true,
    task: "Una stazione per riparare le bici lasciata a sé stessa. Foto: fingete di riparare la bicicletta invisibile di un fantasma impaziente.",
  },
];

/* ---------------- zones ---------------- */

export type ZoneKey = "cirenaica" | "sandonato";

export const ZONES: Record<ZoneKey, { name: string; boundary: LngLat[]; missions: Mission[] }> = {
  cirenaica: { name: "Cirenaica", boundary: BOUNDARY, missions: MISSIONS },
  sandonato: { name: "San Donato", boundary: SANDONATO_BOUNDARY, missions: SANDONATO_MISSIONS },
};

export function zoneOf(key: string | null | undefined) {
  return ZONES[(key as ZoneKey) in ZONES ? (key as ZoneKey) : "cirenaica"];
}
