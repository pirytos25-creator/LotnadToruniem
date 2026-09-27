# Bake ground imagery chunks + DEM grids from the raw downloads.
import numpy as np, json, struct, os
from PIL import Image, ImageEnhance
Image.MAX_IMAGE_PIXELS = None
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', os.path.join(HERE, 'raw')); OUT = os.path.join(HERE, '..', 'assets')
os.makedirs(OUT + '/ground', exist_ok=True)
W = 5887.92
N = 4            # chunks per side
PAD = 32
CH = 2048        # chunk texture size

def grade(im):
    # Esri imagery is dark and contrasty; lift shadows slightly, keep colour.
    a = np.asarray(im).astype(np.float32) / 255.0
    a = np.power(a, 0.88)
    a = a * 1.04
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))

z17 = Image.open(f'{RAW}/z17.jpg').convert('RGB')
np.save(f'{RAW}/z17.npy', np.asarray(z17))  # ungraded copy for roof colours / canopy detection
S = z17.size[0]  # 8192
z17 = grade(z17)
# each chunk covers W/N metres + PAD pixels each side (in chunk pixel scale)
inner = CH - 2 * PAD
src_per_chunk = S / N
scale = inner / src_per_chunk
padsrc = PAD / scale
for j in range(N):
    for i in range(N):
        x0 = i * src_per_chunk - padsrc; y0 = j * src_per_chunk - padsrc
        box = (x0, y0, x0 + src_per_chunk + 2 * padsrc, y0 + src_per_chunk + 2 * padsrc)
        c = z17.transform((CH, CH), Image.EXTENT, box, Image.BICUBIC)
        c.save(f'{OUT}/ground/g{j}{i}.jpg', quality=84, optimize=True, progressive=True)
        c.resize((512, 512), Image.LANCZOS).save(f'{OUT}/ground/l{j}{i}.jpg', quality=80)
# overview (minimap + fallback)
z17.resize((1024, 1024), Image.LANCZOS).save(f'{OUT}/overview.jpg', quality=85)

# far imagery
far = grade(Image.open(f'{RAW}/far13.jpg').convert('RGB'))
far.save(f'{OUT}/far.jpg', quality=80, optimize=True, progressive=True)

def terrarium(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

def sample(grid, n):
    # bilinear sample grid (covering the full extent pixel-edge to edge) at n vertices edge-to-edge
    H = grid.shape[0]
    t = np.linspace(0, H - 1, n)
    i0 = np.floor(t).astype(int); i1 = np.minimum(i0 + 1, H - 1); f = t - i0
    g = grid[i0][:, :] * (1 - f)[:, None] + grid[i1] * f[:, None]
    g = g[:, i0] * (1 - f)[None, :] + g[:, i1] * f[None, :]
    return g

dem15 = terrarium(f'{RAW}/dem15.png')
from scipy.ndimage import gaussian_filter, median_filter
dem15 = median_filter(dem15, 3)
core = sample(dem15, 513)
np.save(os.path.join(RAW, 'core_dem.npy'), core)
dem13 = terrarium(f'{RAW}/dem13.png')
dem13 = gaussian_filter(dem13, 2)
far_g = sample(dem13, 257)
np.save(os.path.join(RAW, 'far_dem.npy'), far_g)
T13 = W / 2
meta = {
  'W': W, 'chunks': N, 'pad': PAD, 'chunkTex': CH,
  'coreDem': {'n': 513},
  'far': {'x0': (4512 - 4519.5) * T13, 'z0': (2661 - 2668.5) * T13, 'size': 16 * T13, 'n': 257},
  'coreMin': float(core.min()), 'coreMax': float(core.max()), 'farMin': float(far_g.min()), 'farMax': float(far_g.max()),
}
json.dump(meta, open(os.path.join(RAW, 'ground_meta.json'), 'w'), indent=1)
print(meta)
