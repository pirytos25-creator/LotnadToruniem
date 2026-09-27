export type Shot = {
  src: string;
  alt: string;
  caption: string;
  credit: string;
  license: string;
  commons: string;
  label: string;
};

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: string[];
  address: string;
  stand: string;
  about: string;
  related: string[];
  shots: Shot[];
};

export type RouteDef = {
  id: string;
  name: string;
  blurb: string;
  placeIds: string[];
};

const file = (name: string) =>
  `https://commons.wikimedia.org/wiki/${encodeURI(`File:${name}`)}`;

export const PLACES: Place[] = [
  {
    id: "ratusz",
    name: "Ratusz Staromiejski",
    lat: 53.01052,
    lng: 18.60412,
    tags: ["rynek", "kopernik"],
    address: "Rynek Staromiejski 1",
    stand: "Stanąć na płycie Rynku, na południe od budynku — fasada z wieżą jest wtedy na wprost.",
    about:
      "Gotycki ratusz Starego Miasta, w dzisiejszej bryle z końca XIV wieku, zajmuje środek Rynku. W środku działa Muzeum Okręgowe. W 1411 roku podpisano tu pierwszy pokój toruński.",
    related: ["pomnik", "artus", "szeroka"],
    shots: [
      {
        src: "/photos/ratusz.jpg",
        alt: "Ceglany ratusz z wieżą, widziany z Rynku Staromiejskiego w Toruniu",
        caption: "Fasada od strony Rynku, z narożną wieżą.",
        credit: "Krzysztof Golik",
        license: "CC BY-SA 4.0",
        commons: file("Old town hall in Torun (8).jpg"),
        label: "Od Rynku",
      },
    ],
  },
  {
    id: "pomnik",
    name: "Pomnik Kopernika",
    lat: 53.01015,
    lng: 18.60435,
    tags: ["rynek", "kopernik"],
    address: "Rynek Staromiejski, przed ratuszem",
    stand: "Południowa część płyty Rynku. W tle wieża zegarowa ratusza — tak jak w kadrze.",
    about:
      "Pomnik odsłonięto w 1853 roku. Model jest dziełem Friedricha Tiecka. Kopernik stoi z sferą armilarną, plecami do południowej pierzei, twarzą ku ratuszowi.",
    related: ["ratusz", "kopernik", "katedra"],
    shots: [
      {
        src: "/photos/pomnik.jpg",
        alt: "Pomnik Mikołaja Kopernika na tle wieży zegarowej ratusza w Toruniu",
        caption: "Pomnik i wieża zegarowa ratusza, kwiecień 2018.",
        credit: "stanislaw.bochnak",
        license: "CC BY-SA 4.0",
        commons: file("Pomnik Mikołaja Kopernika w Toruniu na tle wieży zegarowej.jpg"),
        label: "2018",
      },
    ],
  },
  {
    id: "artus",
    name: "Dwór Artusa",
    lat: 53.00984,
    lng: 18.60449,
    tags: ["rynek"],
    address: "Rynek Staromiejski 6",
    stand: "Wschodnia pierzeja Rynku. To nie jest średniowieczny mur — fasada jest XIX-wieczna.",
    about:
      "Dzisiejszy Dwór Artusa wzniesiono w latach 1889–1891, w miejscu starszej siedziby bractwa. Kadr tnie samą fasadę: blendy i okna, bez płyty Rynku.",
    related: ["ratusz", "pomnik"],
    shots: [
      {
        src: "/photos/artus.jpg",
        alt: "Czerwona ceglana fasada Dworu Artusa z ozdobnymi oknami",
        caption: "Fasada od Rynku, kadr na okna i szczyt.",
        credit: "Krzysztof Golik",
        license: "CC BY-SA 4.0",
        commons: file("Artus Court in Torun (3).jpg"),
        label: "Fasada",
      },
    ],
  },
  {
    id: "szeroka",
    name: "Ulica Szeroka",
    lat: 53.00948,
    lng: 18.6042,
    tags: ["rynek", "mury"],
    address: "ul. Szeroka",
    stand: "Środek ulicy, patrząc na północ — Rynek i wieża ratusza zamykają perspektywę.",
    about:
      "Główna ulica handlowa Starego Miasta, od Rynku w stronę Wisły. Zdjęcie jest z lipca 2010. Wikimania odbywała się wtedy w Gdańsku — autor był w Toruniu przy okazji, nie na konferencji w tym mieście.",
    related: ["ratusz", "zeglarska", "krzywa"],
    shots: [
      {
        src: "/photos/szeroka.jpg",
        alt: "Ulica Szeroka w Toruniu, kamienice i ludzie, widok w stronę Rynku",
        caption: "Lipiec 2010, Szeroka w stronę Rynku.",
        credit: "DerHexer",
        license: "CC BY-SA 3.0",
        commons: file("Toruń, Szeroka Street (DerHexer) 2010-07-17 053.jpg"),
        label: "2010",
      },
    ],
  },
  {
    id: "kopernik",
    name: "Dom Kopernika",
    lat: 53.00931,
    lng: 18.60388,
    tags: ["kopernik"],
    address: "ul. Kopernika 15/17",
    stand: "Chodnik przy gotyckim portalu. Muzeum jest w kamienicy tradycyjnie wiązanej z rodziną astronoma.",
    about:
      "Gotycka kamienica przy ul. Kopernika 15, tradycyjnie wiązana z narodzinami Mikołaja Kopernika 19 lutego 1473. Dziś muzeum. W kadrze portal i sąsiednie domy — nie wnętrze.",
    related: ["pomnik", "katedra", "ratusz"],
    shots: [
      {
        src: "/photos/kopernik.jpg",
        alt: "Gotycka kamienica z ostrołukowym portalem przy ulicy Kopernika w Toruniu",
        caption: "Portal kamienicy nr 15 i sąsiednie domy.",
        credit: "Spens03",
        license: "CC BY-SA 3.0",
        commons: file("Dom kopernika 2, ul kopernika.jpg"),
        label: "Portal",
      },
    ],
  },
  {
    id: "katedra",
    name: "Katedra św. Janów",
    lat: 53.00937,
    lng: 18.60623,
    tags: ["kopernik", "mury"],
    address: "ul. Świętego Jana 2",
    stand: "Bryłę od Wisły widać z bulwaru i z mostów. Wieżę z ulic — z Żeglarskiej i sąsiednich.",
    about:
      "Bazylika katedralna św. Jana Chrzciciela i św. Jana Ewangelisty, gotyk ceglany z XIII–XV wieku. Według tradycji ochrzczono tu Kopernika. Pionowy kadr jest od strony rzeki, drugi pokazuje wieżę z ulicy.",
    related: ["kopernik", "zeglarska", "brzeg"],
    shots: [
      {
        src: "/photos/katedra-pion.jpg",
        alt: "Ceglana katedra św. Janów w Toruniu widziana od strony Wisły",
        caption: "Bryła od strony Wisły.",
        credit: "Gonsek",
        license: "CC BY-SA 4.0",
        commons: file("Toruń, bazylika katedralna.jpg"),
        label: "Od Wisły",
      },
      {
        src: "/photos/katedra.jpg",
        alt: "Wieża katedry św. Janów widziana z ulicy Starego Miasta",
        caption: "Wieża z ulic Starego Miasta.",
        credit: "Kazimierz Mendlik",
        license: "CC BY-SA 3.0",
        commons: file(
          "Widok kościoła św. Jana Chrzciciela i św. Jana Ewangelisty w Toruniu - panoramio.jpg",
        ),
        label: "Z ulicy",
      },
    ],
  },
  {
    id: "mariacki",
    name: "Kościół Mariacki",
    lat: 53.01105,
    lng: 18.60241,
    tags: ["rynek"],
    address: "ul. Panny Marii 4",
    stand: "To zdjęcie nie jest z ulicy Panny Marii. Aparat stał na wieży ratuszowej.",
    about:
      "Dawny kościół franciszkanów pod wezwaniem Wniebowzięcia Najświętszej Marii Panny, XIV wiek. Jedna z większych hal gotyckich w mieście. Kadr Lucasa jest właśnie z wieży ratusza — dachy Rynku są pod spodem.",
    related: ["ratusz", "krzywa"],
    shots: [
      {
        src: "/photos/mariacki.jpg",
        alt: "Kościół Mariacki w Toruniu widziany z góry, z wieży ratusza",
        caption: "Z wieży ratuszowej, nie z poziomu ulicy.",
        credit: "Lucas",
        license: "CC BY-SA 3.0",
        commons: file(
          "Toruń, Kościół Wniebowzięcia Najświętszej Marii Panny (Mariacki) - fotopolska.eu (240763).jpg",
        ),
        label: "Z ratusza",
      },
    ],
  },
  {
    id: "krzywa",
    name: "Krzywa Wieża",
    lat: 53.00838,
    lng: 18.60207,
    tags: ["mury"],
    address: "ul. Pod Krzywą Wieżą 1",
    stand: "U wylotu uliczki pod basztą. Przechył widać wobec pionu ganku i sąsiedniej ściany.",
    about:
      "Baszta w zachodnim ciągu murów miejskich. Odchylenie od pionu ma około półtora metra — to geometria muru, nie zniekształcenie obiektywu. Tuż na południe jest przyczółek mostu Piłsudskiego.",
    related: ["szeroka", "most", "zeglarska"],
    shots: [
      {
        src: "/photos/krzywa.jpg",
        alt: "Krzywa Wieża w Toruniu, ceglana baszta odchylona od pionu",
        caption: "Baszta i sąsiedni szczyt, od ulicy.",
        credit: "Ola Zaparucha",
        license: "CC BY-SA 3.0 pl",
        commons: file("Toruń, Krzywa Wieża (OLA Z.).JPG"),
        label: "Od ulicy",
      },
      {
        src: "/photos/krzywa-pion.jpg",
        alt: "Krzywa Wieża w Toruniu sfotografowana na całą wysokość",
        caption: "Cała wysokość baszty.",
        credit: "Mike Peel",
        license: "CC BY-SA 4.0",
        commons: file("Leaning Tower, Torun.jpg"),
        label: "Cała baszta",
      },
    ],
  },
  {
    id: "zeglarska",
    name: "Brama Żeglarska",
    lat: 53.00827,
    lng: 18.60613,
    tags: ["mury", "wisla"],
    address: "ul. Żeglarska, przy bulwarze",
    stand: "Od strony miasta, w osi ul. Żeglarskiej. Przez prześwit widać Wisłę.",
    about:
      "Brama w południowych murach, od strony rzeki. Rdzeń z XIV wieku, z późniejszymi nadbudowami. Kadr Oli Zaparuchy jest od ulicy, nie z wody.",
    related: ["katedra", "bulwar", "szeroka"],
    shots: [
      {
        src: "/photos/zeglarska.jpg",
        alt: "Brama Żeglarska w Toruniu, widok od ulicy, przez łuk widać Wisłę",
        caption: "Od ul. Żeglarskiej. W prześwicie rzeka.",
        credit: "Ola Zaparucha",
        license: "CC BY-SA 3.0 pl",
        commons: file("Toruń, Brama Żeglarska (widok od ul. Żeglarskiej) (OLA Z.).JPG"),
        label: "Od miasta",
      },
    ],
  },
  {
    id: "mostowa",
    name: "Brama Mostowa",
    lat: 53.00862,
    lng: 18.60893,
    tags: ["mury", "wisla"],
    address: "ul. Mostowa",
    stand: "Najlepiej od strony Wisły, spod bulwaru — tak jest zrobione to zdjęcie.",
    about:
      "Brama wschodniego wyjścia Starego Miasta ku rzece. Kadr od wody obejmuje samą bramę i sąsiednią basztę. Dzisiejszy most drogowy nie leży w jej osi — stoi dalej na zachód.",
    related: ["bulwar", "zamek", "zeglarska"],
    shots: [
      {
        src: "/photos/mostowa.jpg",
        alt: "Brama Mostowa w Toruniu widziana od strony Wisły",
        caption: "Brama i baszta od strony rzeki.",
        credit: "Pko",
        license: "CC BY-SA 3.0",
        commons: file("Torun brama Mostowa od str Wisly.jpg"),
        label: "Od Wisły",
      },
    ],
  },
  {
    id: "zamek",
    name: "Zamek krzyżacki",
    lat: 53.00951,
    lng: 18.61008,
    tags: ["mury", "wisla"],
    address: "przedzamcze, przy Wiśle",
    stand: "Dziedziniec ruin, na wschód od Bramy Mostowej. Z lewego brzegu widać sylwetę, nie detal cegły.",
    about:
      "Zamek z XIII wieku. W 1454 mieszczanie rozebrali go w czasie powstania przeciw Krzyżakom. Zostały mury i wieża gdanisko. Dzienne zdjęcie z drugiego brzegu pokazuje tę sylwetę obok wieży św. Jakuba.",
    related: ["mostowa", "brzeg", "jakub"],
    shots: [
      {
        src: "/photos/zamek.jpg",
        alt: "Ruiny zamku krzyżackiego w Toruniu, ceglane mury i wieża",
        caption: "Ruiny i wieża gdanisko od strony dziedzińca.",
        credit: "Jan Mehlich",
        license: "CC BY-SA 3.0",
        commons: file("Toruń - Zamek Krzyżacki 03.JPG"),
        label: "Dziedziniec",
      },
    ],
  },
  {
    id: "bulwar",
    name: "Bulwar Filadelfijski",
    lat: 53.00837,
    lng: 18.60758,
    tags: ["wisla", "mury"],
    address: "Bulwar Filadelfijski",
    stand: "Deptak pod murami. Dwa kadry nie są z jednego statywu — łączy je brzeg, nie punkt.",
    about:
      "Nadrzeczny deptak pod murami. Nazwa upamiętnia partnerstwo Torunia z Filadelfią. Kolor jest z 18 maja 2010. Czarno-białe zrobił Henryk Poddębski w 1928 roku dla zdjęcia archiwalnego tego samego brzegu, nie jako nakładkę „przed i po”.",
    related: ["zeglarska", "mostowa", "most"],
    shots: [
      {
        src: "/photos/bulwar.jpg",
        alt: "Bulwar Filadelfijski w Toruniu, trawnik i ścieżka wzdłuż Wisły",
        caption: "18 maja 2010, deptak i rzeka.",
        credit: "Ananas96",
        license: "CC BY-SA 4.0",
        commons: file("Bulwar Filadelfijski - Toruń.JPG"),
        label: "2010",
      },
      {
        src: "/photos/bulwar1928.jpg",
        alt: "Bulwar Filadelfijski w Toruniu w 1928 roku, czarno-białe zdjęcie z mostem w tle",
        caption: "1928, Henryk Poddębski. Inny kadr tego brzegu.",
        credit: "Henryk Poddębski, Narodowe Archiwum Cyfrowe",
        license: "domena publiczna",
        commons: file("Bulwar Filadelfijski w Toruniu rok 1928.jpg"),
        label: "1928",
      },
    ],
  },
  {
    id: "most",
    name: "Most Piłsudskiego",
    lat: 53.00683,
    lng: 18.60103,
    tags: ["wisla"],
    address: "most drogowy im. Józefa Piłsudskiego",
    stand: "Pin jest w osi przeprawy, między przyczółkami. Zdjęcie z 2011 roku jest z brzegu — most widać w głębi.",
    about:
      "Drogowy most przez Wisłę na zachód od murów, na południe od Krzywej Wieży. Tędy pieszo schodzi się na lewy brzeg. Zimowy kadr Antekbojara (20 lutego 2011) podpisany jest „Wisła i most drogowy” — nabrzeże jest na pierwszym planie.",
    related: ["krzywa", "brzeg", "bulwar"],
    shots: [
      {
        src: "/photos/most.jpg",
        alt: "Wisła zimą w Toruniu, most drogowy w oddali",
        caption: "20 lutego 2011. Most w głębi kadru, nie z bliska.",
        credit: "Antekbojar",
        license: "CC0",
        commons: file("TORUŃ, AB. 034.JPG"),
        label: "2011",
      },
    ],
  },
  {
    id: "brzeg",
    name: "Lewy brzeg",
    lat: 53.00506,
    lng: 18.61063,
    tags: ["wisla"],
    address: "lewy brzeg, naprzeciw wschodniej starówki",
    stand: "Tu stał aparat. Współrzędne są z GPS w plikach, nie z przybliżenia na mapie.",
    about:
      "Dwa zdjęcia z niemal tego samego punktu. 5 kwietnia 2014, noc: Stare Miasto w wodzie; autor podpisał kadr jako widok z Kępy Bazarowej, a GPS wskazuje ten punkt na lewym brzegu. 8 września 2021, dzień: ruiny zamku i wieża św. Jakuba.",
    related: ["zamek", "jakub", "most"],
    shots: [
      {
        src: "/photos/noca.jpg",
        alt: "Nocna panorama Starego Miasta w Toruniu odbita w Wiśle",
        caption: "5 kwietnia 2014, 21:05. GPS: 53.00514 N, 18.61064 E.",
        credit: "1bumer",
        license: "CC BY-SA 3.0",
        commons: file("Toruń, Stare Miasto z Kępy Bazarowej nocą.jpg"),
        label: "2014, noc",
      },
      {
        src: "/photos/zza-wisly.jpg",
        alt: "Widok zza Wisły na ruiny zamku i kościół św. Jakuba w Toruniu",
        caption: "8 września 2021, 17:11. GPS: 53.00498 N, 18.61062 E. Zamek niżej, św. Jakub wyżej.",
        credit: "Jakub Hałun",
        license: "CC BY-SA 4.0",
        commons: file("Widok zza Wisły na Toruń, 20210908 1711 2822.jpg"),
        label: "2021, dzień",
      },
    ],
  },
  {
    id: "nowe",
    name: "Rynek Nowomiejski",
    lat: 53.0117,
    lng: 18.61054,
    tags: ["nowe"],
    address: "Rynek Nowomiejski",
    stand: "Sam plac jest na dole kadru. Zdjęcie zrobiono znad wschodniego narożnika, nie z bruku.",
    about:
      "Nowe Miasto lokowano w 1264 roku, z własnym rynkiem. Ze Starym połączono je w 1454. Kadr Kapitla pokazuje plac z góry, nie elewację jednej kamienicy.",
    related: ["jakub", "zamek", "ratusz"],
    shots: [
      {
        src: "/photos/nowe.jpg",
        alt: "Rynek Nowomiejski w Toruniu z lotu ptaka, znad wschodniego narożnika",
        caption: "Znad wschodniego narożnika rynku.",
        credit: "Kapitel",
        license: "CC BY-SA 4.0",
        commons: file("Torun rynek nowomiejski (2).jpg"),
        label: "Z góry",
      },
    ],
  },
  {
    id: "jakub",
    name: "Kościół św. Jakuba",
    lat: 53.0119,
    lng: 18.61261,
    tags: ["nowe"],
    address: "ul. Świętego Jakuba 22",
    stand: "Przy ścianie nawy, z bliska. Wieżę z daleka widać na dziennym zdjęciu z lewego brzegu.",
    about:
      "Fara Nowego Miasta, gotyk XIV wieku. Ten kadr jest wzdłuż ceglanej ściany — nie obejmuje całej wieży. Sylweta wieży jest na zdjęciu Jakuba Hałuna z 2021, z drugiego brzegu.",
    related: ["nowe", "brzeg", "zamek"],
    shots: [
      {
        src: "/photos/jakub.jpg",
        alt: "Ceglana ściana kościoła św. Jakuba w Toruniu",
        caption: "Ściana nawy z bliska.",
        credit: "Krzysztof Golik",
        license: "CC BY-SA 4.0",
        commons: file("St James church in Torun (6).jpg"),
        label: "Nawa",
      },
    ],
  },
];

export const ROUTES: RouteDef[] = [
  {
    id: "mury",
    name: "Wzdłuż murów",
    blurb: "Od Krzywej Wieży Szeroką do bram i zamku.",
    placeIds: ["krzywa", "szeroka", "zeglarska", "bulwar", "mostowa", "zamek"],
  },
  {
    id: "kopernik",
    name: "Ślad Kopernika",
    blurb: "Pomnik, ratusz, Dwór Artusa, dom, katedra.",
    placeIds: ["pomnik", "ratusz", "artus", "kopernik", "katedra"],
  },
  {
    id: "dwa",
    name: "Dwa miasta",
    blurb: "Mariacki, Stare Miasto, rynek nowy, św. Jakub.",
    placeIds: ["mariacki", "ratusz", "nowe", "jakub"],
  },
  {
    id: "brzeg",
    name: "Przez most",
    blurb: "Krzywa Wieża, most Piłsudskiego, punkt GPS na lewym brzegu.",
    placeIds: ["krzywa", "most", "brzeg"],
  },
];

export const FILTERS: { id: string; label: string }[] = [
  { id: "wszystkie", label: "Wszystko" },
  { id: "rynek", label: "Rynek" },
  { id: "mury", label: "Mury" },
  { id: "wisla", label: "Wisła" },
  { id: "kopernik", label: "Kopernik" },
  { id: "nowe", label: "Nowe Miasto" },
];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(
  PLACES.map((place) => [place.id, place]),
);

export function shotCount(): number {
  return PLACES.reduce((sum, place) => sum + place.shots.length, 0);
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathMeters(ids: string[]): number {
  let meters = 0;
  for (let i = 1; i < ids.length; i++) {
    const a = PLACE_BY_ID[ids[i - 1]];
    const b = PLACE_BY_ID[ids[i]];
    if (a && b) meters += haversine(a, b);
  }
  return meters;
}

export function formatLeg(meters: number): string {
  const dist =
    meters < 950
      ? `${Math.round(meters)} m`
      : `${(meters / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} km`;
  const minutes = Math.max(1, Math.round((meters * 1.35) / 75));
  return `${dist} na wprost · ~${minutes} min`;
}
