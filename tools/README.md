# Narzędzia do pieczenia danych

Strona czyta gotowe pliki z `assets/`. Te skrypty potrzebne są tylko wtedy, gdy chcesz odświeżyć dane (np. nowe budynki w OSM).

```bash
pip install numpy pillow scipy shapely
python3 tools/fetch_raw.py     # pobiera OSM (Overpass), mozaiki Esri z17/z13 i DEM (AWS Terrain Tiles) do tools/raw/
python3 tools/bake_ground.py   # assets/ground/*.jpg, far.jpg, overview.jpg + siatki DEM
python3 tools/bake_city.py     # assets/city.json, terrain.bin, trees.bin, lights.bin, watermask.png
```

`tools/raw/` nie trafia do repozytorium (~100 MB).

Co robi `bake_city.py`:

- **Budynki**: obrysy i relacje OSM, `building:part` (katedra, Mariacki, św. Jakub, Ratusz). Wysokość z tagów albo z heurystyki typu, strefy i powierzchni. Kształt dachu z `roof:shape` albo z koloru dachu na zdjęciu lotniczym (dachówka oznacza dach spadzisty). Prostokątne budynki dostają dach dwuspadowy lub kopertowy na OBB.
- **Wisła**: poligon `natural=water` (relacja 6553449) minus teksturowane obszary ze zdjęcia (Kępa Bazarowa, piaszczyste łachy). Teren pod wodą jest obniżany.
- **Drzewa**: lasy i parki z OSM, pojedyncze drzewa, szpalery oraz korony drzew wykryte na zdjęciu (nadmiar zieleni, faktura, ciemność), bez budynków, dróg i wody.
- **Latarnie**: co 32–40 m wzdłuż ulic.

Układ współrzędnych: metry lokalne, +X wschód, +Z południe, +Y wysokość n.p.m. Środek (0,0) to 53.00156°N, 18.61084°E. Kwadrat 5887,92 m pokrywa się z kafelkami Web Mercator z15: x 18074–18081, y 10670–10677.
