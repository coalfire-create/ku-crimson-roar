"""Build src/data/campus.json for the Korea University site from OpenStreetMap
(© OpenStreetMap contributors, ODbL; scripts/osm.json via fetch_osm.py).

Metres around the campus centre: x east, z south. Campus buildings are every
building inside OSM's 고려대학교 서울캠퍼스 area (way 26253960), named from
OSM or from a named institution point inside the footprint; everything else
nearby is background.
"""
import json, math, os, re

HERE = os.path.dirname(__file__)
M_LAT = 110540
els = json.load(open(os.path.join(HERE, 'osm.json')))['elements']


def node(name):
    return next((e['lat'], e['lon']) for e in els if e['type'] == 'node' and e.get('tags', {}).get('name') == name)


def centroid(name):
    w = next(e for e in els if e['type'] == 'way' and e.get('tags', {}).get('name') == name and 'geometry' in e)
    g = w['geometry']
    return (sum(p['lat'] for p in g) / len(g), sum(p['lon'] for p in g) / len(g)), g


GATE, _ = centroid('고려대학교 정문')
MAIN, main_ring = centroid('본관')
lat0 = (GATE[0] + MAIN[0]) / 2
lon0 = (GATE[1] + MAIN[1]) / 2
M_LON = M_LAT * math.cos(math.radians(lat0))
to_xz = lambda lat, lon: [round((lon - lon0) * M_LON, 1), round(-(lat - lat0) * M_LAT, 1)]
dist = lambda a, b: math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LON)

CAMPUS = [(p['lat'], p['lon']) for p in next(e for e in els if e['id'] == 26253960)['geometry']]


def inside(pt, ring):
    y, x = pt
    c = False
    for (y1, x1), (y2, x2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


INST = re.compile(r'(관|원|당|센터|학교|대학|대학원|연구소|기념관|홀|본부|학사|하우스|도서관|체육관)$')
points = [((e['lat'], e['lon']), e['tags']['name']) for e in els
          if e['type'] == 'node' and 'name' in e.get('tags', {}) and INST.search(e['tags']['name'])
          and not re.search(r'\d층|카페|편의점|식당|약국|은행|부동산', e['tags']['name'])]
NOT_A_HALL = re.compile(r'계단|연결|통로|다리|창고|온실|정자|식당|지하|부속|경비|주차|유리건물|산책로')

buildings = []
for e in els:
    t = e.get('tags', {})
    if 'building' not in t or e['type'] != 'way' or 'geometry' not in e:
        continue
    ring = [(p['lat'], p['lon']) for p in e['geometry']]
    c = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    name = t.get('name', '')
    campus = inside(c, CAMPUS)
    if dist(c, (lat0, lon0)) > (1400 if campus else 1100):
        continue
    if campus and not name:
        name = min((n for pt, n in points if inside(pt, ring)), key=len, default='')
    try:
        levels = float(t.get('building:levels', 0))
    except ValueError:
        levels = 0
    h = levels * 4 if levels else (16 if campus else 12)
    b = {'p': [to_xz(*p) for p in ring], 'h': round(h, 1), 'c': 1 if campus else 0}
    if campus and levels:
        b['lv'] = int(levels)
    if campus and name and not NOT_A_HALL.search(name):
        b['n'] = name
    buildings.append(b)

landmarks = {'gate': to_xz(*GATE), 'tiger': to_xz(*node('호상')), 'inchonStatue': to_xz(*node('인촌 동상'))}
for key, name in [('main', '본관'), ('library', '중앙도서관'), ('inchon', '인촌기념관'), ('plaza', '중앙광장지하'), ('samsung', '백주년기념삼성관')]:
    c, g = centroid(name)
    landmarks[key] = to_xz(*c)
    landmarks[key + 'Ring'] = [to_xz(p['lat'], p['lon']) for p in g]
# Tiger Road (호랑이길): the footways OSM names so, for the pawprint trail.
tiger_road = [[to_xz(p['lat'], p['lon']) for p in e['geometry']] for e in els
              if e['type'] == 'way' and e.get('tags', {}).get('name') == '호랑이길' and 'geometry' in e]

WIDTH = {'primary': 'w', 'secondary': 'w', 'tertiary': 'w', 'trunk': 'w', 'residential': 'r', 'unclassified': 'r',
         'service': 'r', 'living_street': 'r', 'pedestrian': 'p', 'footway': 'f', 'path': 'f', 'steps': 'f', 'cycleway': 'f', 'track': 'f'}
paths = []
for e in els:
    t = e.get('tags', {})
    k = WIDTH.get(t.get('highway'))
    if k and 'geometry' in e:
        pts = [to_xz(p['lat'], p['lon']) for p in e['geometry']]
        if any(-1200 < x < 1200 and -1200 < z < 1200 for x, z in pts):
            paths.append({'k': k, 'p': pts})

out = {'origin': [round(lat0, 6), round(lon0, 6)], 'buildings': buildings, 'paths': paths, 'landmarks': landmarks, 'tigerRoad': tiger_road}
os.makedirs(os.path.join(HERE, '..', 'src', 'data'), exist_ok=True)
json.dump(out, open(os.path.join(HERE, '..', 'src', 'data', 'campus.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('buildings', len(buildings), 'campus', sum(b['c'] for b in buildings), 'named', sum(1 for b in buildings if 'n' in b))
print('landmarks', {k: v for k, v in landmarks.items() if not k.endswith('Ring')})
print('named:', sorted({b['n'] for b in buildings if 'n' in b}))
