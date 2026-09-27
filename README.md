# Lot nad Toruniem

Przeglądarkowy lot nad prawdziwym Toruniem. To nie makieta i nie atlas zdjęć: lecisz nad obrysami budynków z OpenStreetMap, które stoją na zdjęciu lotniczym i numerycznym modelu terenu. Nad zabytkami wiszą prawdziwe fotografie.

Ten plik jest dla kolejnego AI, które przejmuje projekt. Czytaj go zanim ruszysz sterowanie albo format miasta.

## Czego chce użytkownik

- Lot, nie przeglądarka zdjęć. Strona główna to `FlightApp`. Nie przywracaj atlasu.
- Realny Toruń: plan ulic, kolory dachów ze zdjęcia lotniczego, dziesiątki fotografii miejsc.
- UI po polsku. Auth i baza wyłączone. Nie dodawaj logowania.
- Sterowanie: **A skręca w lewo** przy kamerze zza samolotu. To już jest poprawne. Nie odwracaj znaku.

## Co jest żywe

| Ścieżka | Rola |
|---|---|
| `src/routes/index.tsx` | Renderuje tylko `FlightApp` |
| `src/game/FlightApp.tsx` | Scena Three.js, HUD, dzień/noc, siatka, wczytanie miasta |
| `src/game/flight.ts` | Model lotu. Nie ruszaj znaków bez testu A/D |
| `src/game/city.ts` | Parser `public/flight/city.bin` (magia `TOR3`) i karty zdjęć |
| `public/flight/ground.jpg` | Esri World Imagery, zszyte kafelki z15, ~5,9 km |
| `public/flight/elev.png` | DEM (AWS Terrain Tiles), wysokości w metrach |
| `public/flight/city.bin` | ~25 MB, dachy i ściany |
| `public/flight/photos.json` + `shots/` | ~83 zdjęcia Wikimedia, pozycje w metrach lokalnych |
| `public/flight/meta.json` | Rozmiar terenu, start, miejsca do HUD |
| `data/buildings.json` | Obrysy OSM użyte do pieczenia (`n`, `h`, `k`, `p`, `holes`) |
| `scripts/bake-city.mjs` | Ponowne pieczenie `city.bin` |

Martwe, nie podłączaj z powrotem jako strony głównej: `src/components/Atlas.tsx`, `src/components/CityMap.tsx`, `src/data/atlas.ts`, `src/game/Flyover.tsx`, `src/game/buildWorld.ts`, `src/game/sim.ts`, `src/game/world.ts`, `public/photos/`.

## Układ współrzędnych

Płaszczyzna jest w metrach na ziemi, nie w stopniach. **+X wschód, +Z południe, +Y w górę.** Yaw 0 patrzy na północ, czyli w **−Z**. Wektor do przodu: `(-sin(yaw), 0, -cos(yaw))`. `+roll` / `rotation.z` to lewe skrzydło w dół i dlatego **dodatni roll zwiększa yaw**.

Klatka pokrywa się z `ground.jpg`:

- Web Mercator, `R = 20037508.342789244`, kafelek z15 = `2R/32768`.
- Siatka 8×8, róg `x0 = 18074`, `y0 = 10670` (środkowy kafelek był 18077, 10672).
- `COS = cos(53.0015°)`, `MXC = -R + (x0+4)*tile`, `MYC = R - (y0+4)*tile`.
- Lokalnie: `x = (mx(lon)-MXC)*COS`, `z = -(my(lat)-MYC)*COS`.
- Szerokość i głębokość: **5887,92 m**. Sprawdzone na Ratuszu: z `53.0105224, 18.6041183` wychodzi około `(−450, −997)`.
- Start w `meta.json`: południe od Wisły, nos na północ, w stronę starówki.
- UV dachu, które zgadza się ze zdjęciem: `u = x/W+0.5`, `v = 0.5−z/W`, a w obrazie `y = (1−v)`.

Teren wizualny to DEM × `exag` (1,35). Kolizja: teren + `max(16 m, wysokość budynku + 1,2 m) × exag`, żeby samolot sunął nad dachami, a nie przez nie.

## `city.bin` (TOR3)

Kolejność, little-endian:

1. 4 bajty `TOR3`
2. `uint32` liczba wierzchołków dachu, potem `float32` × 6 na wierzchołek: `x,y,z,r,g,b` (kolor 0–1)
3. `uint32` liczba wierzchołków ścian, ten sam układ
4. `uint32` GRID (512), `float32` roofMax, `uint8[512²]` wysokości dachów do kolizji

Dachy to siatka komórek (ok. 5–14 m, gęściej na małych kamienicach). Kolor komórki jest próbkowany ze środka, z lotniczego RGB. Ściany biorą przyciemniony kolor z tego samego zdjęcia, kościoły i bramy są przesunięte w stronę cegły.

**Nie kładź tekstury `ground.jpg` na wielką geometrię dachów przez `MeshBasicMaterial.map`.** W tym projekcie mapa na tym meshu się nie próbkuje (zostaje jednolity kolor). Działają kolory wierzchołków. Małe karty zdjęć (`Sprite`) teksturę biorą normalnie.

Wysokości znanych obiektów są podbite w `scripts/bake-city.mjs` (Ratusz, Mariacki, św. Jakub, katedra, Krzywa Wieża, bramy, Jordanki, Arena). OSM często podaje wysokość nawy, nie wieży. Nie stawiaj całego Ratusza na 40 m: to podniesie skrzydła razem z wieżą.

## Zdjęcia

`photos.json`: `{ src, x, z, w, h, name }`. Sprite stoi dnem na dachu (`Sprite.center.y = 0`) i zawsze patrzy w kamerę. Źródła: geotagi Commons oraz ilustracje z polskich haseł Wikipedii o zabytkach. Część plików odrzucono (wnętrza, portret Kopernika, rycina Dybowa z 1793, grafika planetarium, motocykl, niedźwiedzie).

Commons łatwo zwraca HTTP 429. Między zapytaniami czekaj ≥2 s, bierz miniatury 500 px (720 px bywa niedozwolone). Nie zrywaj setek plików naraz.

## Czego nie rób

- Nie zbieraj hurtowo ortofotomapy GUGiK. Regulamin tego zabrania, a wcześniejsze kafelki i tak były puste albo nie z tego miejsca. Zostaw Esri.
- Nie zamieniaj lotu z powrotem w atlas.
- Nie koloruj całego miasta powtarzalną teksturą cegły. To zasłania prawdziwe zdjęcie.
- Nie odwracaj A/D. Test: przy gazie do przodu A zwiększa yaw i daje dodatni roll.

## Odpalenie

```bash
npm install
npm run dev
```

Dev słucha `0.0.0.0:8080` i musi iść przez `npm run dev` (skrypt dokleja `.grok/app-env.json`, tam `VITE_AUTH_ENABLED=false`). Bez tego pliku platforma potrafi włączyć auth. `startup.sh` tylko podnosi dev, jeśli port milczy.

Build: `npm run build`, potem `npm run preview:restart` (podgląd na 127.0.0.1:8081). Sonda `window.__controlsTest`: `getYaw`, `getSpeed`, `getRoll`, `getPos`, `setKeys`, `resetPose`, `hop(x,z)`.

## Ponowne pieczenie miasta

Potrzebne, tylko gdy zmieniasz obrysy albo gęstość kolorów:

- `data/buildings.json` jest w repo.
- `data/ground.rgb`: `uint32` szerokość, `uint32` wysokość, potem surowe RGB z `ground.jpg` (ten plik nie jest w gicie, ~12 MB).
- `data/elev.f32`: `uint32` bok siatki, dwa `float32` (min/max), potem wysokości w metrach. Źródło to `elev.png`.
- `npm install earcut` (nie ma go w zależnościach aplikacji) i `node scripts/bake-city.mjs`.

Overpass, który działał: `https://overpass.openstreetmap.fr/api/interpreter`. `overpass-api.de` potrafi wisieć.

## Atrybucja, którą trzeba zostawić w HUD

Esri (World Imagery), budynki © OpenStreetMap, zdjęcia Wikimedia Commons, teren AWS Terrain Tiles.

To rekonstrukcja ze zdjęcia i mapy, nie pomiar geodezyjny. Wysokości wież są przybliżone, a fotografie są kartami nad miejscem, nie teksturą każdej fasady.
