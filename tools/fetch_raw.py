# Download raw inputs for the bake (needs internet): OSM via Overpass, Esri World Imagery mosaics,
# AWS Terrain Tiles (terrarium). Writes into tools/raw/. Be gentle with the public servers.
# Usage: python3 tools/fetch_raw.py
import io, json, math, os, time, urllib.parse, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', os.path.join(HERE, 'raw'))
os.makedirs(RAW, exist_ok=True)
UA = {'User-Agent': 'LotNadToruniem-bake/1.0 (github.com/pirytos25-creator/LotnadToruniem)'}

R = 20037508.342789244
TILE15 = 2 * R / 32768
COS = math.cos(math.radians(53.0015))
MXC = -R + (18074 + 4) * TILE15
MYC = R - (10670 + 4) * TILE15
BB = '52.9751,18.5669,53.0280,18.6548'       # core 5.9 km square
BB_REL = '52.9701,18.5589,53.0330,18.6628'   # slightly larger for relation members

def X(lon): return round(((lon / 180 * R) - MXC) * COS, 1)
def Z(lat): return round(-((math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * R / math.pi) - MYC) * COS, 1)

def get(url, data=None, tries=4):
    for t in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except Exception as e:
            print('retry', url[:80], e); time.sleep(3 + 5 * t)
    raise RuntimeError(url)

def overpass(q):
    for ep in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):
        try: return json.loads(get(ep, ('data=' + urllib.parse.quote(q)).encode()))
        except Exception as e: print('overpass failed at', ep, e)
    raise RuntimeError('overpass')

KEEP = set('building building:part building:levels building:min_level min_height height roof:shape roof:levels roof:height roof:colour roof:material building:colour building:material name amenity historic man_made natural waterway landuse leisure highway railway bridge layer tunnel barrier lanes width surface tower:type religion denomination leaf_type service area water tourism shop type location covered disused'.split())
tags = lambda t: {k: v for k, v in (t or {}).items() if k in KEEP}

def fetch_osm():
    q = f"""[out:json][timeout:180];(
 way["building"]({BB}); way["building:part"]({BB});
 way["natural"~"water|wood|scrub|grassland|wetland|sand|beach"]({BB});
 way["waterway"]({BB}); way["landuse"]({BB});
 way["leisure"~"park|garden|pitch|stadium|track|playground"]({BB});
 way["highway"]({BB}); way["railway"~"rail|tram|light_rail"]({BB});
 way["man_made"~"bridge|pier|tower|chimney"]({BB}); node["man_made"~"tower|chimney|mast"]({BB});
 way["barrier"~"city_wall|wall"]({BB}); way["historic"]({BB});
 node["natural"="tree"]({BB}); way["natural"="tree_row"]({BB}); way["amenity"="parking"]({BB});
);out tags geom qt;"""
    d = overpass(q)
    out = []
    for e in d['elements']:
        if e['type'] == 'node': out.append({'t': 'n', 'g': tags(e.get('tags')), 'p': [X(e['lon']), Z(e['lat'])]})
        elif e['type'] == 'way' and e.get('geometry'):
            out.append({'t': 'w', 'id': e['id'], 'g': tags(e.get('tags')), 'p': [v for g in e['geometry'] for v in (X(g['lon']), Z(g['lat']))]})
    json.dump(out, open(f'{RAW}/torun_osm.json', 'w'), ensure_ascii=False)
    time.sleep(5)
    q = f"""[out:json][timeout:170];(relation["natural"~"water|wood|scrub|wetland|grassland|sand"]({BB_REL});relation["water"]({BB_REL});
relation["waterway"="riverbank"]({BB_REL});relation["building"]({BB_REL});relation["building:part"]({BB_REL});
relation["landuse"~"forest|grass|meadow|cemetery|allotments|recreation_ground|residential"]({BB_REL});relation["leisure"~"park|garden|nature_reserve"]({BB_REL});)->.a;
.a out body;way(r.a)({BB_REL});out geom;"""
    d = overpass(q)
    ways = {str(e['id']): [v for g in e['geometry'] if g for v in (X(g['lon']), Z(g['lat']))] for e in d['elements'] if e['type'] == 'way' and e.get('geometry')}
    rels = []
    for e in d['elements']:
        if e['type'] != 'relation': continue
        m = [[x['ref'], x['role']] for x in e['members'] if x['type'] == 'way' and str(x['ref']) in ways]
        if m: rels.append({'id': e['id'], 'g': e.get('tags', {}), 'm': m})
    used = {str(r_[0]) for r in rels for r_ in r['m']}
    json.dump({'rels': rels, 'ways': {k: ways[k] for k in used}}, open(f'{RAW}/torun_rel.json', 'w'), ensure_ascii=False)

def mosaic(url, z, x0, y0, n, name, mode='RGB', fmt='JPEG'):
    im = Image.new(mode, (n * 256, n * 256))
    for j in range(n):
        for i in range(n):
            t = Image.open(io.BytesIO(get(url.format(z=z, x=x0 + i, y=y0 + j)))).convert(mode)
            im.paste(t, (i * 256, j * 256))
        print(name, f'{j + 1}/{n}')
    im.save(f'{RAW}/{name}', fmt, **({'quality': 92} if fmt == 'JPEG' else {}))

if __name__ == '__main__':
    fetch_osm()
    ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    TERR = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
    mosaic(ESRI, 17, 18074 * 4, 10670 * 4, 32, 'z17.jpg')
    mosaic(ESRI, 13, 4512, 2661, 16, 'far13.jpg')
    mosaic(TERR, 13, 4512, 2661, 16, 'dem13.png', fmt='PNG')
    mosaic(TERR, 15, 18074, 10670, 8, 'dem15.png', fmt='PNG')
    print('done ->', RAW)
