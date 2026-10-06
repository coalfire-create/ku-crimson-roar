"""Build the free, photoreal-style world around the campus (no paid APIs):

- public/terrain.png: heightmap resampled from AWS Terrain Tiles (dem.png,
  Terrarium encoding) onto a 5 m grid; 16-bit height in R (high) and G (low),
  in centimetres above HMIN.
- src/data/world.json: OSM (© OpenStreetMap contributors, ODbL) land areas
  by class, trees (mapped trees + tree rows + forest scatter), building base
  heights and styles, and the scroll tour waypoints.

Scene frame matches campus.json: metres around its origin, x east, z south,
y up with y = 0 at the ground height of the origin.
"""
import json, math, os, random, re
from PIL import Image
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..')
M_LAT = 110540
camp = json.load(open(os.path.join(ROOT, 'src/data/campus.json')))
lat0, lon0 = camp['origin']
M_LON = M_LAT * math.cos(math.radians(lat0))
to_xz = lambda lat, lon: ((lon - lon0) * M_LON, -(lat - lat0) * M_LAT)
to_ll = lambda x, z: (lat0 - z / M_LAT, lon0 + x / M_LON)

meta = json.load(open(os.path.join(HERE, 'dem.json')))
dem = Image.open(os.path.join(HERE, 'dem.png')).convert('RGB')
px = dem.load()


def elev(lat, lon):
    n = 2 ** meta['z']
    fx = ((lon + 180) / 360 * n - meta['x0']) * 256
    fy = ((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n - meta['y0']) * 256
    x0, y0 = int(fx), int(fy)
    tx, ty = fx - x0, fy - y0
    h = lambda x, y: (lambda r, g, b: r * 256 + g + b / 256 - 32768)(*px[x, y])
    a = h(x0, y0) * (1 - tx) + h(x0 + 1, y0) * tx
    b = h(x0, y0 + 1) * (1 - tx) + h(x0 + 1, y0 + 1) * tx
    return a * (1 - ty) + b * ty


E0 = elev(lat0, lon0)
ground = lambda x, z: elev(*to_ll(x, z)) - E0

# --- heightmap ---
X0, X1, Z0, Z1, STEP = -1200, 1200, -1200, 1200, 5
GW, GH = (X1 - X0) // STEP + 1, (Z1 - Z0) // STEP + 1
hs = [[ground(X0 + i * STEP, Z0 + j * STEP) for i in range(GW)] for j in range(GH)]
HMIN = math.floor(min(min(r) for r in hs)) - 1
img = Image.new('RGB', (GW, GH))
for j in range(GH):
    for i in range(GW):
        v = max(0, min(65535, round((hs[j][i] - HMIN) * 100)))
        img.putpixel((i, j), (v >> 8, v & 255, 0))
img.save(os.path.join(ROOT, 'public/terrain.png'))
print('terrain', GW, GH, 'HMIN', HMIN, 'max', round(max(max(r) for r in hs), 1))

# --- land areas ---
land = json.load(open(os.path.join(HERE, 'land.json')))['elements']
CLASS = {'grass': 'grass', 'park': 'grass', 'garden': 'grass', 'recreation_ground': 'grass', 'grassland': 'grass', 'allotments': 'grass',
         'cemetery': 'grass', 'playground': 'grass', 'wood': 'wood', 'forest': 'wood', 'scrub': 'wood', 'heath': 'wood',
         'pitch': 'pitch', 'track': 'track', 'stadium': 'pitch', 'sports_centre': 'pitch', 'parking': 'parking', 'water': 'water',
         'bare_rock': 'rock', 'construction': 'dirt', 'brownfield': 'dirt', 'residential': 'urban', 'retail': 'urban',
         'commercial': 'urban', 'education': 'campus', 'religious': 'urban', 'military': 'urban', 'industrial': 'urban', 'railway': 'urban'}


def simplify(pts, tol=1.2):
    if len(pts) < 4:
        return pts
    a, b = pts[0], pts[-1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz) or 1
    far, idx = 0, 0
    for i, p in enumerate(pts[1:-1], 1):
        d = abs(dz * (p[0] - a[0]) - dx * (p[1] - a[1])) / L
        if d > far:
            far, idx = d, i
    if far < tol:
        return [a, b]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def rings_of(e):
    if e['type'] == 'way' and 'geometry' in e:
        return [[p for p in e['geometry']]]
    if e['type'] == 'relation':
        return [m['geometry'] for m in e.get('members', []) if m.get('role') == 'outer' and 'geometry' in m]
    return []


areas = []
wood_polys = []
tree_pts = []
for e in land:
    t = e.get('tags', {})
    if e['type'] == 'node' and t.get('natural') == 'tree':
        x, z = to_xz(e['lat'], e['lon'])
        tree_pts.append((x, z, 1))
        continue
    if t.get('natural') == 'tree_row' and 'geometry' in e:
        pts = [to_xz(p['lat'], p['lon']) for p in e['geometry']]
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(bx - ax, bz - az) / 7))
            for k in range(n):
                tree_pts.append((ax + (bx - ax) * k / n, az + (bz - az) * k / n, 1))
        continue
    k = t.get('landuse') or t.get('natural') or t.get('leisure') or t.get('amenity')
    if t.get('area:highway'):
        k = 'parking'
    cls = CLASS.get(k)
    if not cls:
        continue
    for ring in rings_of(e):
        pts = [to_xz(p['lat'], p['lon']) for p in ring]
        if not any(X0 < x < X1 and Z0 < z < Z1 for x, z in pts):
            continue
        # Closed ring: simplify the two halves so the ends never coincide.
        mid = len(pts) // 2
        pts = simplify(pts[:mid + 1])[:-1] + simplify(pts[mid:])
        if len(pts) < 3:
            continue
        areas.append({'k': cls, 'p': [[round(x, 1), round(z, 1)] for x, z in pts]})
        if cls == 'wood':
            wood_polys.append(pts)
order = ['urban', 'campus', 'dirt', 'grass', 'wood', 'parking', 'pitch', 'track', 'water', 'rock']
areas.sort(key=lambda a: order.index(a['k']))


def inside(pt, ring):
    x, z = pt
    c = False
    for (x1, z1), (x2, z2) in zip(ring, ring[1:] + ring[:1]):
        if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1):
            c = not c
    return c


# Forest scatter on a jittered grid (deterministic), kept off building footprints.
rnd = random.Random(1905)
foot = [b['p'] for b in camp['buildings']]
fbox = [(min(p[0] for p in f), max(p[0] for p in f), min(p[1] for p in f), max(p[1] for p in f)) for f in foot]
SP = 10
for poly in wood_polys:
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    for gx in range(int(max(min(xs), X0)) // SP * SP, int(min(max(xs), X1)), SP):
        for gz in range(int(max(min(zs), Z0)) // SP * SP, int(min(max(zs), Z1)), SP):
            x, z = gx + rnd.uniform(0, SP), gz + rnd.uniform(0, SP)
            if not inside((x, z), poly):
                continue
            if any(b[0] < x < b[1] and b[2] < z < b[3] and inside((x, z), f) for f, b in zip(foot, fbox)):
                continue
            tree_pts.append((x, z, 0))
# Hillsides (개운산, 애기능) above the campus floor: forested even where OSM has no wood area.
nonwood = [a['p'] for a in areas if a['k'] not in ('wood', 'grass')]
nbox = [(min(p[0] for p in f), max(p[0] for p in f), min(p[1] for p in f), max(p[1] for p in f)) for f in nonwood]
HS = 13
hill = 0
for gx in range(X0, X1, HS):
    for gz in range(Z0, Z1, HS):
        x, z = gx + rnd.uniform(0, HS), gz + rnd.uniform(0, HS)
        y = ground(x, z)
        if y < 38 + rnd.uniform(0, 12):
            continue
        if any(b[0] < x < b[1] and b[2] < z < b[3] and inside((x, z), f) for f, b in zip(foot, fbox)):
            continue
        if any(b[0] < x < b[1] and b[2] < z < b[3] and inside((x, z), f) for f, b in zip(nonwood, nbox)):
            continue
        tree_pts.append((x, z, 0))
        hill += 1
print('hill trees', hill)
trees = []
for x, z, mapped in tree_pts:
    if X0 < x < X1 and Z0 < z < Z1:
        trees += [round(x, 1), round(z, 1), round(ground(x, z), 1), round(rnd.uniform(0.75, 1.3) * (1.1 if mapped else 1.0), 2)]
print('areas', len(areas), 'trees', len(trees) // 4)

# --- building bases and styles ---
# The humanities campus is famously gothic granite; the science campus is newer.
GOTHIC = {'본관', '인촌기념관', '중앙도서관', '대강당', '백주년기념삼성관', '경영본관', '현대자동차경영관', '라이시움', '국제관',
          '문과대학서관', '고려대학교 정경관', '법학관구관', '법학관신관', 'CJ법학관', '해송법학도서관', '우당교양관', '민족문화관',
          '민족문화관 별관', '동원글로벌리더십홀', '인문사회관', '사범대학본관', '사범대학 신관', '운초우선교육관', '교우회관',
          'SK미래관', '미디어관', '4.18기념관', '아세아문제연구원', '수당삼양패컬티하우스', '일반대학원', '타이거플라자'}
GLASS = {'신공학관', '미래융합기술관', '로봇융합관', '창의관', '고려대학교 파이빌99', '아산이학관', '하나과학관 A동', '하나과학관 B동',
         '우정정보관', '메디힐지구환경관', 'R&D센터', '과학도서관', '송현스퀘어', '한투스퀘어'}
HOSPITAL = re.compile(r'병원|의과대학|의학|간호|장례식장')
DORM = re.compile(r'학사|하우스|생활관|International House|어린이집')
bases, styles = [], []
for b in camp['buildings']:
    base = min(ground(x, z) for x, z in b['p'])
    bases.append(round(base, 1))
    n = b.get('n', '')
    if not b['c']:
        s = 't'
    elif n in GOTHIC:
        s = 'g'
    elif n in GLASS:
        s = 'm'
    elif HOSPITAL.search(n):
        s = 'h'
    elif DORM.search(n):
        s = 'd'
    else:
        s = 'c'
    styles.append(s)

# --- tour: a loop over the whole campus, landmark to landmark ---
TOUR = [('정문 앞', 250, 225), ('정문', 90, 80), ('중앙광장', 20, 10), ('호상', 30, -80), ('중앙도서관', 60, -215),
        ('경영본관', 170, -165), ('백주년기념삼성관', 110, -60), ('본관 앞', -20, -20), ('본관', -85, -55), ('인촌기념관', -210, -90),
        ('문과대학서관', -150, 20), ('대강당', -110, 110), ('우당교양관', -170, 215), ('애기능', -380, 280),
        ('하나과학관', -660, 320), ('과학도서관', -570, 470)]
tour = [[x, z, round(max(ground(x, z), 0), 1)] for _, x, z in TOUR]

out = {'E0': round(E0, 1), 'terrain': {'x0': X0, 'z0': Z0, 'step': STEP, 'w': GW, 'h': GH, 'hmin': HMIN}, 'areas': areas,
       'trees': trees, 'bases': bases, 'styles': ''.join(styles), 'tour': tour}
json.dump(out, open(os.path.join(ROOT, 'src/data/world.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('world.json KB', os.path.getsize(os.path.join(ROOT, 'src/data/world.json')) // 1024, 'styles', {s: styles.count(s) for s in set(styles)})
