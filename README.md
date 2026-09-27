# Lot nad Toruniem

Przeglądarkowy lot małym samolotem nad Toruniem. Jeden `index.html`, czysty JavaScript i Three.js. Bez serwera i bez budowania, więc działa od razu na GitHub Pages.

**Dwa tryby:**

1. **Fotorealistyczny 3D.** Prawdziwa fotogrametria Google Photorealistic 3D Tiles, strumieniowana przez [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS). Wystarczy darmowy token [Cesium ion](https://ion.cesium.com/signup) (bez karty, trzeba dodać asset „Google Photorealistic 3D Tiles”) albo klucz Google Maps Platform z włączonym Map Tiles API. Klucz trzymany jest tylko w `localStorage` przeglądarki i nie trafia do repozytorium.
2. **Rekonstrukcja z map (bez klucza).** 15,5 tys. budynków z OpenStreetMap, w tym części 3D katedry, kościoła Mariackiego, św. Jakuba i Ratusza. Na Starówce gotyckie schodkowe szczyty. Dachy biorą kolor ze zdjęcia lotniczego Esri (0,7 m/px), płaskie dachy mają pełne zdjęcie. Do tego Wisła z prawdziwą linią brzegową i odbiciami nieba, Most Piłsudskiego z kratownicami, most kolejowy i łuk mostu Zawackiej, mury obronne, ~147 tys. drzew i ~7 tys. latarni nocą. Teren pochodzi z DEM, a zdjęcie lotnicze sięga ~25 km wokół miasta.

## Sterowanie

| Klawisz | Działanie |
|---|---|
| W / S | gaz |
| A / D | przechył i skręt w lewo / prawo |
| ↑ / ↓ | nos w górę / w dół |
| Q / E | ster kierunku |
| C | kamera: pościg / kokpit / orbita / kinowa |
| T | wycieczka automatyczna nad zabytkami |
| N | dzień / noc |
| R | restart |
| mysz | przeciąganie = rozglądanie, kółko = odległość kamery |

Minimapa jest klikalna (przelot w wybrane miejsce). W ustawieniach (⚙) jest pora dnia, jakość, cienie, chmury, drzewa i nazwy zabytków.

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
src/flight.js       model lotu + autopilot wycieczki
src/google3d.js     tryb fotorealistyczny (Google 3D Tiles / Cesium ion)
vendor/             three.js r186 + dodatki (CSM, Sky, bloom, 3d-tiles-renderer, earcut)
assets/             upieczone dane (patrz tools/README.md)
tools/              skrypty do pobrania i upieczenia danych
```

Test sterowania (konsola): `__controlsTest.setKeys(['KeyA'])` powinno zwiększać przechył (`getRoll() > 0`) i skręcać w lewo (kurs `getYaw()` maleje).

## Atrybucja

Zdjęcia lotnicze: Esri World Imagery · Budynki, drogi, woda © współtwórcy OpenStreetMap (ODbL) · Teren: AWS Terrain Tiles (Mapzen) · Fotografie zabytków: Wikimedia Commons · Tryb 3D: Google Photorealistic 3D Tiles (dane © Google i dostawcy).

To rekonstrukcja z map i zdjęć, nie pomiar geodezyjny. Wysokości części budynków są szacowane.
