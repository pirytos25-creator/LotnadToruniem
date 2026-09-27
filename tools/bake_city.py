# Bake city data for "Lot nad Toruniem" from raw OSM + imagery downloads.
# Outputs into site/assets: city.json (buildings, water, walls, bridges, landmarks),
# trees.bin, lights.bin, terrain.bin
import json, math, struct, random, os
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union, polygonize, linemerge
from shapely.validation import make_valid
from shapely import prepared
from scipy.ndimage import uniform_filter, binary_dilation, distance_transform_edt

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', os.path.join(HERE, 'raw'))
OUT = os.path.join(HERE, '..', 'assets')
random.seed(7)
W = 5887.92
HALF = W / 2
PX = 8192 / W   # z17 pixels per metre

osm = json.load(open(f'{RAW}/torun_osm.json'))
rel = json.load(open(f'{RAW}/torun_rel.json'))
gm = json.load(open(f'{RAW}/ground_meta.json'))
core_dem = np.load(f'{RAW}/core_dem.npy')
far_dem = np.load(f'{RAW}/far_dem.npy')
img = np.load(f'{RAW}/z17.npy')  # uint8 HxWx3

def pts(flat):
    return [(flat[i], flat[i + 1]) for i in range(0, len(flat) - 1, 2)]

def to_px(x, z):
    return (x + HALF) * PX, (z + HALF) * PX

def dem_at(x, z):
    n = core_dem.shape[0]
    fx = (x + HALF) / W * (n - 1); fz = (z + HALF) / W * (n - 1)
    fx = min(max(fx, 0), n - 1.001); fz = min(max(fz, 0), n - 1.001)
    i = int(fx); j = int(fz); tx = fx - i; tz = fz - j
    a = core_dem[j, i] * (1 - tx) + core_dem[j, i + 1] * tx
    b = core_dem[j + 1, i] * (1 - tx) + core_dem[j + 1, i + 1] * tx
    return a * (1 - tz) + b * tz

# ---------------------------------------------------------------- helpers
def parse_num(v):
    if v is None: return None
    try:
        v = str(v).replace(',', '.').strip().split(';')[0]
        v = v.replace('m', '').strip()
        return float(v)
    except Exception:
        return None

NAMED = {
    'red': '#b03a2e', 'darkred': '#8b1a1a', 'brown': '#7a4a2a', 'grey': '#8a8a88', 'gray': '#8a8a88', 'black': '#2a2a2a',
    'white': '#e8e8e4', 'green': '#3f7a55', 'darkgreen': '#2f5a40', 'blue': '#3d5a80', 'yellow': '#e6cf7a', 'orange': '#d0752e',
    'beige': '#d9c7a3', 'silver': '#b9bcc0', 'lightgrey': '#c4c4c0', 'maroon': '#7a2a1f', 'darkgrey': '#5a5a58', 'cream': '#efe4c8',
    'lightsteelblue': '#b0c4de', 'teal': '#2f7a74', 'tan': '#c8ad85', 'pink': '#e0a8a8', 'copper': '#5f8f7a',
}
def parse_color(c):
    if not c: return None
    c = str(c).strip().lower()
    if c in NAMED: c = NAMED[c]
    if not c.startswith('#'):
        if all(ch in '0123456789abcdef' for ch in c) and len(c) in (3, 6): c = '#' + c
        else: return None
    c = c[1:]
    if len(c) == 3: c = ''.join(ch * 2 for ch in c)
    if len(c) != 6: return None
    try: return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    except Exception: return None

def hexc(rgb): return '%02x%02x%02x' % tuple(int(max(0, min(255, v))) for v in rgb)

# ------------------------------------------------ relation ring assembly
def join_chains(lines):
    """merge list of point lists into chains by matching endpoints"""
    chains = [list(l) for l in lines if len(l) >= 2]
    changed = True
    def close(a, b): return abs(a[0] - b[0]) < 0.3 and abs(a[1] - b[1]) < 0.3
    while changed:
        changed = False
        for i in range(len(chains)):
            a = chains[i]
            if close(a[0], a[-1]) and len(a) > 3: continue
            for j in range(len(chains)):
                if i == j: continue
                b = chains[j]
                if close(b[0], b[-1]) and len(b) > 3: continue
                if close(a[-1], b[0]): a = a + b[1:]
                elif close(a[-1], b[-1]): a = a + b[::-1][1:]
                elif close(a[0], b[-1]): a = b + a[1:]
                elif close(a[0], b[0]): a = b[::-1] + a[1:]
                else: continue
                chains[i] = a; chains.pop(j); changed = True; break
            if changed: break
    return chains

BBOX = box(-HALF, -HALF, HALF, HALF)

def rel_polygon(r, classify=None):
    outers = [pts(rel['ways'][str(m[0])]) for m in r['m'] if m[1] in ('outer', '', 'outline') and str(m[0]) in rel['ways']]
    inners = [pts(rel['ways'][str(m[0])]) for m in r['m'] if m[1] == 'inner' and str(m[0]) in rel['ways']]
    oc = join_chains(outers); ic = join_chains(inners)
    def closed(c): return len(c) > 3 and abs(c[0][0] - c[-1][0]) < 0.3 and abs(c[0][1] - c[-1][1]) < 0.3
    polys = []
    open_lines = []
    for c in oc:
        if closed(c): polys.append(Polygon(c))
        else: open_lines.append(LineString(c))
    holes = [Polygon(c) for c in ic if closed(c)]
    open_inner = [LineString(c) for c in ic if not closed(c)]
    geom = None
    if polys:
        geom = unary_union([make_valid(p) for p in polys])
    if open_lines and classify is not None:
        # clipped relation: polygonize with bbox and classify faces
        lines = unary_union(open_lines + open_inner + [BBOX.exterior])
        faces = [f for f in polygonize(lines) if f.area > 50]
        keep = [f for f in faces if classify(f)]
        if keep:
            g2 = unary_union(keep)
            geom = g2 if geom is None else unary_union([geom, g2])
    if geom is None: return None
    for h in holes:
        geom = geom.difference(make_valid(h))
    return make_valid(geom).intersection(BBOX)

# water-colour classifier for clipped faces
def water_fraction(poly):
    rp = poly.representative_point()
    minx, miny, maxx, maxy = poly.bounds
    hits = tot = 0
    pp = prepared.prep(poly)
    for _ in range(300):
        x = random.uniform(minx, maxx); z = random.uniform(miny, maxy)
        if not pp.contains(Point(x, z)): continue
        px, py = to_px(x, z)
        px = int(min(max(px, 0), 8191)); py = int(min(max(py, 0), 8191))
        r, g, b = img[py, px].astype(int)
        tot += 1
        if (r + g + b) / 3 < 80 and dem_at(x, z) < 36.5: hits += 1
    return hits / max(tot, 1)

# ----------------------------------------------------------- collect ways
ways = [e for e in osm if e['t'] == 'w']
nodes = [e for e in osm if e['t'] == 'n']

# ------------------------------------------------------------------ WATER
water_polys = []
for e in ways:
    g = e['g']
    if g.get('natural') == 'water' or g.get('waterway') in ('riverbank', 'dock'):
        p = pts(e['p'])
        if len(p) >= 4:
            poly = make_valid(Polygon(p))
            if poly.area > 30: water_polys.append((poly, g))
for r in rel['rels']:
    g = r['g']
    if g.get('natural') == 'water' or g.get('waterway') == 'riverbank':
        poly = rel_polygon(r, classify=lambda f: water_fraction(f) > 0.5)
        if poly is not None and not poly.is_empty:
            water_polys.append((poly, g))
water_union = unary_union([p for p, _ in water_polys]).intersection(BBOX)
print('water area km2', water_union.area / 1e6)

# water level per connected component: low percentile of DEM samples inside
def geoms(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    return [x for x in getattr(g, 'geoms', []) if isinstance(x, Polygon)]

water_out = []
for poly in geoms(water_union):
    if poly.area < 60: continue
    poly = poly.simplify(0.6)
    if poly.is_empty or not isinstance(poly, Polygon): continue
    minx, miny, maxx, maxy = poly.bounds
    samp = []
    pp = prepared.prep(poly)
    for _ in range(400):
        x = random.uniform(minx, maxx); z = random.uniform(miny, maxy)
        if pp.contains(Point(x, z)): samp.append((x, z, dem_at(x, z)))
    if not samp: continue
    arr = np.array(samp)
    # plane fit for long rivers (slope), else flat
    if poly.area > 200000:
        A = np.c_[arr[:, 0], arr[:, 1], np.ones(len(arr))]
        coef, *_ = np.linalg.lstsq(A, arr[:, 2], rcond=None)
        lvl = [float(coef[0]), float(coef[1]), float(coef[2] - 0.6)]
    else:
        lvl = [0.0, 0.0, float(np.percentile(arr[:, 2], 20) - 0.3)]
    ext = [round(v, 1) for c in poly.exterior.coords[:-1] for v in c]
    holes = [[round(v, 1) for c in h.coords[:-1] for v in c] for h in poly.interiors]
    water_out.append({'p': ext, 'h': holes, 'lvl': [round(lvl[0], 6), round(lvl[1], 6), round(lvl[2], 2)]})
print('water polys', len(water_out))

# refined water mask: OSM polygons minus textured (forest/sand) imagery
Sm = 2048; scm = Sm / W
mimg = Image.new('L', (Sm, Sm), 0); dmi = ImageDraw.Draw(mimg)
for wo in water_out:
    dmi.polygon([((wo['p'][i] + HALF) * scm, (wo['p'][i + 1] + HALF) * scm) for i in range(0, len(wo['p']), 2)], fill=255)
    for hh in wo['h']: dmi.polygon([((hh[i] + HALF) * scm, (hh[i + 1] + HALF) * scm) for i in range(0, len(hh), 2)], fill=0)
wpoly = np.asarray(mimg) > 0
_im = img.astype(np.float32); _L = _im.mean(2)
_mm = uniform_filter(_L, 9); _m2 = uniform_filter(_L * _L, 9); _sd = np.sqrt(np.maximum(_m2 - _mm * _mm, 0))
sd4 = _sd.reshape(Sm, 4, Sm, 4).mean((1, 3)); L4 = _L.reshape(Sm, 4, Sm, 4).mean((1, 3))
from scipy.ndimage import binary_opening, binary_closing, gaussian_filter
land = binary_opening((uniform_filter(sd4, 5) > 9.5) | (L4 > 140), iterations=2)
wmask2k = binary_closing(wpoly & ~land, iterations=2) & wpoly
Image.fromarray((gaussian_filter(wmask2k.astype(np.float32), 1.0) * 255).astype(np.uint8)).save(f'{OUT}/watermask.png')
del _im, _L, _mm, _m2, _sd

# per-pixel water level (nearest polygon level) on the DEM grid, carve terrain
n = core_dem.shape[0]
lvl_img = np.full((n, n), np.nan)
def g2d(x, z): return ((x + HALF) / W * (n - 1), (z + HALF) / W * (n - 1))
for wo in water_out:
    m = Image.new('L', (n, n), 0); dd = ImageDraw.Draw(m)
    dd.polygon([g2d(wo['p'][i], wo['p'][i + 1]) for i in range(0, len(wo['p']), 2)], fill=255)
    for hh in wo['h']: dd.polygon([g2d(hh[i], hh[i + 1]) for i in range(0, len(hh), 2)], fill=0)
    ys, xs = np.nonzero(np.asarray(m) > 0)
    X = xs / (n - 1) * W - HALF; Z = ys / (n - 1) * W - HALF
    a, b, c = wo['lvl']
    lvl_img[ys, xs] = a * X + b * Z + c
# water mask resampled to the DEM grid
from PIL import Image as _I
wm_grid = np.asarray(_I.fromarray((wmask2k * 255).astype(np.uint8)).resize((n, n), _I.BILINEAR)) > 100
wm_grid &= ~np.isnan(lvl_img)
from scipy.ndimage import distance_transform_edt as edt
_, (iy, ix) = edt(np.isnan(lvl_img), return_indices=True)
lvl_full = lvl_img[iy, ix]
dist = edt(~wm_grid)
dem2 = core_dem.copy()
dem2 = np.where(wm_grid, np.minimum(dem2, lvl_full - 2.5), dem2)
edge = (~wm_grid) & (dist <= 1.5)
dem2 = np.where(edge, np.minimum(dem2, lvl_full + 0.4), dem2)
core_dem_carved = dem2

# ------------------------------------------------------------ BUILDINGS
OLD_TOWN = Polygon([(-700, -715), (-420, -735), (-110, -760), (40, -830), (210, -930), (280, -1060),
                    (260, -1245), (-60, -1285), (-420, -1255), (-660, -1215), (-730, -990)])
OT = prepared.prep(OLD_TOWN)

raw_b = []
for e in ways:
    g = e['g']
    if not (g.get('building') or g.get('building:part')): continue
    if g.get('building') in ('proposed', 'demolished', 'no', 'construction_site') : continue
    p = pts(e['p'])
    if len(p) < 4: continue
    poly = make_valid(Polygon(p))
    if poly.is_empty or poly.area < 6: continue
    raw_b.append((poly, g, e.get('id')))
for r in rel['rels']:
    g = r['g']
    if not (g.get('building') or g.get('building:part')): continue
    poly = rel_polygon(r)
    if poly is None or poly.is_empty: continue
    raw_b.append((poly, g, r['id']))
print('raw buildings', len(raw_b))

parts = [(p, g) for p, g, _ in raw_b if g.get('building:part') and g.get('building:part') != 'no']
parts_idx = [(p.buffer(0), g) for p, g in parts]
from shapely.strtree import STRtree
part_tree = STRtree([p for p, _ in parts_idx]) if parts_idx else None

def sample_roof_rgb(poly):
    # median colour of eroded footprint pixels
    inner = poly.buffer(-1.2)
    if inner.is_empty or inner.area < 4: inner = poly
    minx, miny, maxx, maxy = inner.bounds
    x0, y0 = to_px(minx, miny); x1, y1 = to_px(maxx, maxy)
    x0 = int(max(x0, 0)); y0 = int(max(y0, 0)); x1 = int(min(x1 + 1, 8191)); y1 = int(min(y1 + 1, 8191))
    if x1 <= x0 or y1 <= y0: return None
    w, h = x1 - x0, y1 - y0
    m = Image.new('L', (w, h), 0); dd = ImageDraw.Draw(m)
    for pg in geoms(inner):
        dd.polygon([((x + HALF) * PX - x0, (z + HALF) * PX - y0) for x, z in pg.exterior.coords], fill=255)
    mm = np.asarray(m) > 0
    sub = img[y0:y1, x0:x1][mm]
    if len(sub) < 3: return None
    L = sub.astype(int).sum(1)
    # drop deep shadows and specular highlights
    ok = (L > np.percentile(L, 20)) & (L < np.percentile(L, 95))
    if ok.sum() > 3: sub = sub[ok]
    return tuple(np.median(sub, axis=0))

def is_tile_red(rgb):
    if rgb is None: return False
    r, g, b = rgb
    return r > g * 1.12 and r > b * 1.25 and r > 70

STYLE = {'kam': 0, 'brick': 1, 'blok': 2, 'dom': 3, 'hala': 4, 'nowy': 5, 'garaz': 6}
ROOF = {'flat': 0, 'gabled': 1, 'hipped': 2, 'pyramidal': 3, 'dome': 4, 'skillion': 5, 'spire': 6, 'mansard': 7, 'half-hipped': 2,
        'gambrel': 1, 'saltbox': 1, 'quadruple_saltbox': 2, 'round': 4, 'onion': 4, 'cone': 6, 'many': 0}

KAM_COLS = ['e8d8b8', 'f0e2c4', 'd9b99b', 'cfa27e', 'e6cfa8', 'bfc6b2', 'e2d3c7', 'c9a88a', 'dcc59b', 'efe6d6', 'd7b98f', 'c7b49a']
BRICK_COLS = ['9a4a32', '8d3f2a', 'a45a3c', '93462f']
BLOK_COLS = ['e8e4da', 'd9d6cc', 'ece6d2', 'cfd3d6', 'e3dccb', 'd8d0c0', 'c9ccc6', 'e6dfcf']
DOM_COLS = ['e9e2d0', 'd8cbb0', 'efe9dc', 'cdb89a', 'e0d6c2', 'd6d0c4']
HALA_COLS = ['b8b8b0', '9ea3a6', 'c8c0a8', 'a8aaa4', 'b5ada0']
NOWY_COLS = ['c8d0d8', 'b9c4cc', 'd4d8dc', 'a9b6c0']

out_b = []
skipped_outline = 0
for poly, g, oid in raw_b:
    is_part = bool(g.get('building:part')) and g.get('building:part') != 'no'
    btype = g.get('building') or 'yes'
    area = poly.area
    # outline suppressed when parts cover it
    if not is_part and part_tree is not None:
        cand = part_tree.query(poly)
        cov = 0.0
        for ci in cand:
            pp, _ = parts_idx[ci]
            try: cov += poly.intersection(pp).area
            except Exception: pass
        if cov > 0.5 * area:
            skipped_outline += 1
            continue
    c = poly.representative_point()
    cx, cz = c.x, c.y
    in_ot = OT.contains(c)
    levels = parse_num(g.get('building:levels'))
    rlev = parse_num(g.get('roof:levels'))
    h = parse_num(g.get('height'))
    minh = parse_num(g.get('min_height')) or 0.0
    if not minh and g.get('building:min_level'):
        minh = (parse_num(g.get('building:min_level')) or 0) * 3.2
    rh = parse_num(g.get('roof:height'))
    shape = (g.get('roof:shape') or '').lower()
    roof_rgb = parse_color(g.get('roof:colour'))
    wall_rgb = parse_color(g.get('building:colour'))
    sampled = sample_roof_rgb(poly) if roof_rgb is None else None
    red = is_tile_red(roof_rgb or sampled)
    rng = random.Random(oid or int(cx * 7 + cz * 13))

    # --- style
    rel_type = g.get('amenity') == 'place_of_worship' or btype in ('church', 'cathedral', 'chapel')
    if btype in ('garage', 'garages', 'shed', 'carport', 'kiosk', 'roof', 'greenhouse', 'hut'):
        style = 'garaz'
    elif rel_type or g.get('historic') in ('city_gate', 'tower', 'castle', 'church', 'monument', 'city_walls') or g.get('building:material') in ('brick', 'bricks') or btype in ('fort', 'castle', 'tower'):
        style = 'brick'
    elif in_ot:
        style = 'brick' if rng.random() < 0.28 else 'kam'
    elif btype in ('house', 'detached', 'semidetached_house', 'bungalow', 'cabin', 'farm', 'terrace', 'villa'):
        style = 'dom'
    elif btype in ('industrial', 'warehouse', 'retail', 'service', 'manufacture', 'transportation', 'hangar', 'storage_tank', 'sports_hall', 'sports_centre'):
        style = 'hala'
    elif btype in ('office', 'commercial', 'hotel', 'university', 'hospital', 'college') and area > 600:
        style = 'nowy'
    elif btype in ('apartments', 'dormitory', 'residential'):
        style = 'blok' if (levels or 0) >= 4 or area > 350 else 'kam'
    else:
        if area < 45: style = 'garaz'
        elif area < 220: style = 'dom'
        elif area < 2500: style = 'blok' if not red else 'kam'
        else: style = 'hala'

    # --- heights
    if h is None:
        if levels is not None:
            h = levels * (3.3 if style in ('kam', 'brick') else 3.0) + 0.6
            if rlev: h += rlev * 2.6
        else:
            if style == 'garaz': h = 2.8 if btype != 'roof' else 4.5
            elif btype == 'roof': h = 4.5
            elif in_ot: h = rng.uniform(13.0, 17.5)
            elif style == 'dom': h = rng.uniform(6.0, 8.0)
            elif style == 'kam': h = rng.uniform(12.0, 16.0)
            elif style == 'blok': h = rng.choice([13.5, 14.5, 15.5, 15.5, 16.5]) if area < 3000 else 16.0
            elif style == 'hala': h = rng.uniform(6.5, 10.0)
            elif style == 'nowy': h = rng.uniform(12.0, 18.0)
            elif style == 'brick': h = rng.uniform(10.0, 15.0)
            else: h = 9.0
    if btype == 'roof' and not minh: minh = max(0.0, h - 1.2)
    h = max(h, minh + 1.0)

    # --- roof shape
    if not shape:
        if style == 'garaz': shape = 'flat'
        elif style in ('blok', 'hala', 'nowy'): shape = 'gabled' if (red and area < 700 and style != 'nowy') else 'flat'
        elif style in ('dom',): shape = 'gabled' if red or rng.random() < 0.6 else 'hipped'
        elif style in ('kam', 'brick'):
            shape = 'gabled' if (red or in_ot or rng.random() < 0.5) and area < 2500 else 'flat'
        else: shape = 'flat'
        if rel_type and not is_part: shape = 'gabled'
    shape_id = ROOF.get(shape, 0)
    # tall thin pyramidal tower -> spire
    if shape_id == 3 and rh and rh > 12 and area < 400: shape_id = 6

    if shape_id != 0:
        if rh is None:
            if style in ('kam', 'brick'):
                rh = rng.uniform(5.5, 9.0) if area < 600 else rng.uniform(8.0, 13.0)
            elif style == 'dom': rh = rng.uniform(3.2, 5.0)
            else: rh = rng.uniform(3.0, 5.0)
            if rel_type: rh = max(rh, 11.0)
        # keep eave above min height
        rh = min(rh, max(1.0, (h - minh) * 0.85))
    else:
        rh = 0.0

    # --- colours
    if roof_rgb is None:
        if sampled is not None:
            r, gg, b = sampled
            if shape_id in (1, 2, 3, 5, 6, 7) and red:
                # push towards clean ceramic tile
                roof_rgb = (min(255, r * 1.15), gg * 0.92, b * 0.85)
            else:
                roof_rgb = (r * 1.05, gg * 1.02, b * 1.02)
        else:
            roof_rgb = (140, 70, 50) if shape_id else (120, 120, 118)
    if wall_rgb is None:
        pal = {'kam': KAM_COLS, 'brick': BRICK_COLS, 'blok': BLOK_COLS, 'dom': DOM_COLS, 'hala': HALA_COLS, 'nowy': NOWY_COLS, 'garaz': HALA_COLS}[style]
        wall_rgb = parse_color('#' + rng.choice(pal))

    # --- geometry (OBB for pitched rectangles)
    for pg in geoms(poly):
        if pg.area < 6: continue
        pg = pg.simplify(0.25, preserve_topology=True)
        if pg.is_empty or not isinstance(pg, Polygon): continue
        pg = pg.buffer(0)
        if not isinstance(pg, Polygon): continue
        ext = list(pg.exterior.coords)[:-1]
        if len(ext) < 3: continue
        # CCW in (x,z) => shapely orient
        from shapely.geometry.polygon import orient
        pg = orient(pg, 1.0)
        ext = list(pg.exterior.coords)[:-1]
        holes = [list(h.coords)[:-1] for h in pg.interiors]
        obb = None
        if shape_id in (1, 2, 5, 7) and not holes:
            mrr = pg.minimum_rotated_rectangle
            fill = pg.area / max(mrr.area, 1e-6)
            if fill > 0.86:
                cc = list(mrr.exterior.coords)[:4]
                e1 = (cc[1][0] - cc[0][0], cc[1][1] - cc[0][1]); e2 = (cc[2][0] - cc[1][0], cc[2][1] - cc[1][1])
                l1 = math.hypot(*e1); l2 = math.hypot(*e2)
                if l1 >= l2: ang = math.atan2(e1[1], e1[0]); L, Wd = l1, l2
                else: ang = math.atan2(e2[1], e2[0]); L, Wd = l2, l1
                mc = mrr.centroid
                obb = [round(mc.x, 2), round(mc.y, 2), round(ang, 4), round(L, 2), round(Wd, 2)]
        rec = {
            'p': [round(v, 2) for c in ext for v in c],
            'h': round(h, 1), 'mh': round(minh, 1), 'rs': shape_id, 'rh': round(rh, 1),
            'rc': hexc(roof_rgb), 'wc': hexc(wall_rgb), 's': STYLE[style],
        }
        if holes: rec['ho'] = [[round(v, 2) for c in hh for v in c] for hh in holes]
        if obb: rec['o'] = obb
        if g.get('name') and not is_part: rec['n'] = g['name']
        if btype == 'roof': rec['cn'] = 1
        out_b.append(rec)
print('buildings out', len(out_b), 'outlines skipped', skipped_outline)

# lean-tower easter egg: Krzywa Wieza
for b in out_b:
    if b.get('n') == 'Krzywa Wieża':
        b['lean'] = [0.0, 0.085]  # tilt (dx per m of height, dz per m) towards the south-ish (Wisła)
        b['h'] = max(b['h'], 15.0)

# ---------------------------------------------------------------- WALLS
walls = []
for e in ways:
    g = e['g']
    if g.get('barrier') == 'city_wall' or g.get('historic') == 'city_walls':
        walls.append({'p': [round(v, 1) for v in e['p']], 'h': 7.5, 't': 1.6})
print('city walls', len(walls))

# ---------------------------------------------------------------- BRIDGES
bridges = []
for e in ways:
    g = e['g']
    if not g.get('bridge') or g.get('bridge') == 'no': continue
    kind = g.get('highway') or g.get('railway')
    if not kind: continue
    if kind in ('footway', 'path', 'steps', 'cycleway', 'service', 'track', 'pedestrian') and 'Most' not in (g.get('name') or ''):
        wdt = 3.5
    else:
        lanes = parse_num(g.get('lanes')) or (2 if g.get('highway') else 1)
        wdt = parse_num(g.get('width')) or (lanes * 3.5 + 2.5 if g.get('highway') else 5.5)
    p = e['p']
    if len(p) < 4: continue
    ln = LineString(pts(p))
    if ln.length < 8: continue
    name = g.get('name') or ''
    over_water = ln.intersection(water_union).length
    style = 0
    if 'Piłsudskiego' in name: style = 1           # parabolic steel truss
    elif g.get('railway') == 'rail' and over_water > 50: style = 2   # railway truss
    elif 'Zawackiej' in name and over_water > 50: style = 3        # arch
    bridges.append({'p': [round(v, 1) for v in p], 'w': round(wdt, 1), 's': style, 'rail': 1 if g.get('railway') else 0, 'n': name})
print('bridges', len(bridges))

# --------------------------------------------------------------- TREES
# building + road exclusion mask at z17 resolution/4 (2048)
S = 2048
sc = S / W
excl = Image.new('L', (S, S), 0); de = ImageDraw.Draw(excl)
for b in out_b:
    p = b['p']; de.polygon([((p[i] + HALF) * sc, (p[i + 1] + HALF) * sc) for i in range(0, len(p), 2)], fill=255)
for e in ways:
    g = e['g']
    if g.get('highway') in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street') or g.get('railway') in ('rail', 'tram'):
        wd = {'primary': 14, 'secondary': 12, 'trunk': 16, 'tertiary': 10, 'residential': 7, 'service': 5}.get(g.get('highway'), 8)
        de.line([((e['p'][i] + HALF) * sc, (e['p'][i + 1] + HALF) * sc) for i in range(0, len(e['p']), 2)], fill=255, width=max(1, int(wd * sc)))
excl = (np.asarray(excl) > 0) | wmask2k
excl = binary_dilation(excl, iterations=1)

# canopy from imagery
im = img.astype(np.float32)
r_, g_, b_ = im[..., 0], im[..., 1], im[..., 2]
L = (r_ + g_ + b_) / 3
m = uniform_filter(L, 5); m2 = uniform_filter(L * L, 5); sd = np.sqrt(np.maximum(m2 - m * m, 0))
eg = g_ - np.maximum(r_, b_)
can = (eg > 10) & (L < 80) & (sd > 5)
can = uniform_filter(can.astype(np.float32), 7)
# downsample to 2048
can = can.reshape(S, 4, S, 4).mean(axis=(1, 3))
can = (can > 0.45) & ~excl

# forest polygons (osm) → density
forest_img = Image.new('L', (S, S), 0); df = ImageDraw.Draw(forest_img)
park_img = Image.new('L', (S, S), 0); dp = ImageDraw.Draw(park_img)
def draw_poly(dr, geom, val):
    for pg in geoms(geom):
        dr.polygon([((x + HALF) * sc, (z + HALF) * sc) for x, z in pg.exterior.coords], fill=val)
        for h in pg.interiors: dr.polygon([((x + HALF) * sc, (z + HALF) * sc) for x, z in h.coords], fill=0)
conifer_img = Image.new('L', (S, S), 0); dcf = ImageDraw.Draw(conifer_img)
for e in ways:
    g = e['g']
    if g.get('landuse') == 'forest' or g.get('natural') in ('wood',):
        p = pts(e['p'])
        if len(p) >= 4:
            poly = make_valid(Polygon(p)); draw_poly(df, poly, 255)
            if g.get('leaf_type') == 'needleleaved': draw_poly(dcf, poly, 255)
    elif g.get('leisure') in ('park', 'garden') or g.get('landuse') == 'cemetery' or g.get('natural') == 'scrub':
        p = pts(e['p'])
        if len(p) >= 4: draw_poly(dp, make_valid(Polygon(p)), 255)
for r in rel['rels']:
    g = r['g']
    if g.get('landuse') == 'forest' or g.get('natural') == 'wood':
        def green_cls(f):
            minx, miny, maxx, maxy = f.bounds
            cnt = hit = 0
            ppf = prepared.prep(f)
            for _ in range(200):
                x = random.uniform(minx, maxx); z = random.uniform(miny, maxy)
                if not ppf.contains(Point(x, z)): continue
                i = int((x + HALF) * sc); j = int((z + HALF) * sc)
                if 0 <= i < S and 0 <= j < S:
                    cnt += 1; hit += can[j, i]
            return cnt > 0 and hit / cnt > 0.25
        poly = rel_polygon(r, classify=green_cls)
        if poly is not None:
            draw_poly(df, poly, 255)
            if g.get('leaf_type') in ('needleleaved', 'mixed'): draw_poly(dcf, poly, 255)
forest = (np.asarray(forest_img) > 0) & ~excl
park = (np.asarray(park_img) > 0) & ~excl
conifer = np.asarray(conifer_img) > 0
# also imagery canopy far from the old town and south of the river tends to be pine
trees = []
rng = np.random.default_rng(11)
def scatter(mask, spacing, kind_fn):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0: return
    cell_area = (1 / sc) ** 2
    count = int(len(xs) * cell_area / (spacing * spacing))
    idx = rng.choice(len(xs), size=min(count, len(xs)), replace=False) if count < len(xs) else np.arange(len(xs))
    for k in idx:
        x = (xs[k] + rng.random()) / sc - HALF
        z = (ys[k] + rng.random()) / sc - HALF
        trees.append((x, z) + kind_fn(xs[k], ys[k]))
def kind_general(i, j):
    con = conifer[j, i] or (rng.random() < 0.15)
    h = rng.uniform(9, 19) if not con else rng.uniform(12, 22)
    r = h * rng.uniform(0.28, 0.4) if not con else h * rng.uniform(0.18, 0.24)
    return (h, r, 1 if con else 0)
scatter(forest & can, 7.0, kind_general)
scatter(forest & ~can, 13.0, kind_general)
scatter(park & can & ~forest, 7.5, kind_general)
scatter(can & ~forest & ~park, 8.5, kind_general)
for e in nodes:
    if e['g'].get('natural') == 'tree':
        x, z = e['p']
        if abs(x) < HALF and abs(z) < HALF:
            h = rng.uniform(8, 16); trees.append((x, z, h, h * 0.33, 0))
for e in ways:
    if e['g'].get('natural') == 'tree_row':
        ln = LineString(pts(e['p']))
        dd = 0.0
        while dd < ln.length:
            pnt = ln.interpolate(dd)
            h = rng.uniform(9, 15); trees.append((pnt.x, pnt.y, h, h * 0.32, 0)); dd += 8.0
print('trees', len(trees))
tb = bytearray()
for x, z, h, r, k in trees:
    tb += struct.pack('<hhBBB', int(round(x * 10)), int(round(z * 10)), int(min(255, h * 8)), int(min(255, r * 16)), k)
open(f'{OUT}/trees.bin', 'wb').write(bytes(tb))

# ------------------------------------------------------------ STREET LIGHTS
lights = []
for e in ways:
    g = e['g']
    hw = g.get('highway')
    if hw in ('primary', 'secondary', 'tertiary', 'trunk', 'residential', 'living_street', 'pedestrian', 'unclassified') and not g.get('tunnel'):
        ln = LineString(pts(e['p']))
        step = 32.0 if hw in ('primary', 'secondary', 'trunk') else 40.0
        off = 7.0 if hw in ('primary', 'secondary', 'trunk') else 4.5
        dd = step * 0.5
        side = 1
        while dd < ln.length:
            a = ln.interpolate(dd); b2 = ln.interpolate(min(dd + 1, ln.length))
            dx, dz = b2.x - a.x, b2.y - a.y; l = math.hypot(dx, dz) or 1
            nx, nz = -dz / l, dx / l
            x, z = a.x + nx * off * side, a.y + nz * off * side
            if abs(x) < HALF and abs(z) < HALF:
                lights.append((x, z))
            side = -side
            dd += step
print('lights', len(lights))
lb = bytearray()
for x, z in lights: lb += struct.pack('<hh', int(round(x * 10)), int(round(z * 10)))
open(f'{OUT}/lights.bin', 'wb').write(bytes(lb))

# ------------------------------------------------------------- TERRAIN BIN
def u16(a, lo, scale):
    return np.clip(np.round((a - lo) * scale), 0, 65535).astype('<u2')
cmin = float(core_dem_carved.min()) - 1; fmin = float(far_dem.min()) - 1
tb = struct.pack('<4sIffIff', b'TRN1', core_dem_carved.shape[0], cmin, 100.0, far_dem.shape[0], fmin, 20.0)
tb += u16(core_dem_carved, cmin, 100.0).tobytes() + u16(far_dem, fmin, 20.0).tobytes()
open(f'{OUT}/terrain.bin', 'wb').write(tb)

# ------------------------------------------------------------ LANDMARKS
places = json.load(open(os.path.join(HERE, 'places.json'), encoding='utf-8'))
city = {
    'W': W, 'ground': gm,
    'buildings': out_b, 'water': water_out, 'walls': walls, 'bridges': bridges,
    'places': places,
}
json.dump(city, open(f'{OUT}/city.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print('city.json MB', os.path.getsize(f'{OUT}/city.json') / 1e6)
