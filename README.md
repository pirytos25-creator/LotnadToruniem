# Lot nad Toruniem

Spacer w powietrzu nad Toruniem: unosisz się nad Starówką i Wisłą jak dron albo ptak, bez samolotu i bez rozbijania się. Jeden `index.html`, czysty JavaScript i Three.js. Bez serwera i bez budowania, więc działa od razu na GitHub Pages.

**Dwa tryby:**

1. **Fotorealistyczny 3D.** Prawdziwa fotogrametria Google Photorealistic 3D Tiles, strumieniowana przez [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS). Wystarczy darmowy token [Cesium ion](https://ion.cesium.com/signup) (bez karty, trzeba dodać asset „Google Photorealistic 3D Tiles”) albo klucz Google Maps Platform z włączonym Map Tiles API. Klucz trzymany jest tylko w `localStorage` przeglądarki i nie trafia do repozytorium.
2. **Rekonstrukcja z map (bez klucza).** 15,5 tys. budynków z OpenStreetMap, w tym części 3D katedry, kościoła Mariackiego, św. Jakuba i Ratusza. Na Starówce gotyckie schodkowe szczyty. Dachy biorą kolor ze zdjęcia lotniczego Esri (0,7 m/px), płaskie dachy mają pełne zdjęcie. Do tego Wisła z prawdziwą linią brzegową i odbiciami nieba, Most Piłsudskiego z kratownicami, most kolejowy i łuk mostu Zawackiej, mury obronne, ~147 tys. drzew i ~7 tys. latarni nocą. Teren pochodzi z DEM, a zdjęcie lotnicze sięga ~25 km wokół miasta.

## Sterowanie

| Klawisz | Działanie |
|---|---|
| W / S | naprzód / wstecz |
| A / D | obrót w lewo / prawo |
| Q / E | w bok |
| Spacja / C | w górę / w dół |
| ↑ / ↓ | spojrzenie w górę / w dół |
| mysz | przeciąganie = rozglądanie, kółko = tempo spaceru |
| Shift | chwilowo szybciej |
| T | spacer z przewodnikiem (płynna trasa nad Starówką, Nowym Miastem i Wisłą) |
| B | fajerwerki nad Wisłą |
| P / K | tryb zdjęć bez interfejsu / zapisz zdjęcie PNG |
| M | dźwięk |
| N | dzień / noc |
| Home | powrót do punktu startu |

Nie da się zejść niżej niż ~25 m nad dachy (w trybie Google 3D ~45 m), bo z bliska fotogrametria robi się rozmyta. Minimapa jest klikalna. W ustawieniach (⚙) są pora dnia, jakość, cienie, chmury, drzewa i nazwy zabytków.

## Bajery

- **🍪 Polowanie na pierniki.** Nad 24 zabytkami unoszą się złote piernikowe serca. Przelot przez serce daje ciekawostkę o miejscu, a postęp zapisuje się w przeglądarce. Po zebraniu wszystkich startuje pokaz fajerwerków.
- **Życie nad miastem:** stada mew krążą nad Wisłą i Starówką, balony na ogrzane powietrze dryfują wysoko, a biały statek wycieczkowy pływa po Wiśle (nocą ze światłami).
- **Fajerwerki** można odpalić klawiszem B. Nocą pojawiają się też same, co jakiś czas.
- **Tryb zdjęć** (P) chowa interfejs, a K zapisuje PNG.
- Dźwięki są syntezowane w WebAudio, bez plików.

## Uruchomienie lokalne

Moduły ES nie działają z `file://`, więc potrzebny jest dowolny serwer statyczny:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## GitHub Pages

Settings → Pages → *Deploy from a branch* → `main` / `(root)`. Strona będzie pod `https://pirytos25-creator.github.io/LotnadToruniem/`.

## Struktura

```
index.html          UI, HUD, panele
src/main.js         scena, wczytywanie, kamery, pętla
src/buildings.js    geometria budynków (ściany, dachy, schodkowe szczyty, mury)
src/terrain.js      teren (4×4 kafle ze zdjęciem z17 + pierścień do ~25 km), woda
src/trees.js        drzewa (instancing, 2 poziomy LOD)
src/bridges.js      mosty i wiadukty (pomosty, filary, kratownice, łuk)
src/sky.js          niebo, słońce dla 53°N, mgła, gwiazdy, oświetlenie IBL
src/materials.js    shadery elewacji/dachów (okna, światła nocą, zdjęcie na dachach)
src/walk.js         ruch w powietrzu + spacer z przewodnikiem (spline)
src/fun.js          pierniki, ptaki, balony, statek, fajerwerki, dźwięk
src/google3d.js     tryb fotorealistyczny (Google 3D Tiles / Cesium ion)
vendor/             three.js r186 + dodatki (CSM, Sky, bloom, 3d-tiles-renderer, earcut)
assets/             upieczone dane (patrz tools/README.md)
tools/              skrypty do pobrania i upieczenia danych
```

Test sterowania (konsola): `__controlsTest.setKeys(['KeyA'])` obraca w lewo (kurs `getYaw()` maleje).

## Atrybucja

Zdjęcia lotnicze: Esri World Imagery · Budynki, drogi, woda © współtwórcy OpenStreetMap (ODbL) · Teren: AWS Terrain Tiles (Mapzen) · Fotografie zabytków: Wikimedia Commons · Tryb 3D: Google Photorealistic 3D Tiles (dane © Google i dostawcy).

To rekonstrukcja z map i zdjęć, nie pomiar geodezyjny. Wysokości części budynków są szacowane.
