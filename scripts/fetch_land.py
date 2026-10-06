"""Fetch the free, open layers for the photoreal-style campus (no API keys):
- tiles/*.png: AWS Open Data Terrain Tiles (Terrarium, z15) around the campus,
  stitched into dem.png.
- land.json: OpenStreetMap (© OpenStreetMap contributors, ODbL) landuse,
  natural, leisure and parking areas, tree rows and single trees.
"""
import io, json, math, os, sys, time, urllib.parse, urllib.request
from PIL import Image
HERE = os.path.dirname(__file__)
Z = 15
S, W, N, E = 37.5760, 127.0160, 37.6020, 127.0490


def tile(lat, lon):
    n = 2 ** Z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


x0, y1 = tile(S, W)
x1, y0 = tile(N, E)
os.makedirs(os.path.join(HERE, 'tiles'), exist_ok=True)
dem = Image.new('RGB', ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
for x in range(x0, x1 + 1):
    for y in range(y0, y1 + 1):
        p = os.path.join(HERE, 'tiles', f'{x}-{y}.png')
        if not os.path.exists(p):
            open(p, 'wb').write(urllib.request.urlopen(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png', timeout=60).read())
        dem.paste(Image.open(p).convert('RGB'), ((x - x0) * 256, (y - y0) * 256))
dem.save(os.path.join(HERE, 'dem.png'))
print('dem', dem.size, 'tiles x', x0, x1, 'y', y0, y1)
json.dump({'z': Z, 'x0': x0, 'y0': y0}, open(os.path.join(HERE, 'dem.json'), 'w'))

B = f'{S},{W},{N},{E}'
q = f'''[out:json][timeout:180];
(way["landuse"]({B}); relation["landuse"]({B});
 way["natural"~"wood|scrub|grassland|water|heath|bare_rock"]({B}); relation["natural"~"wood|scrub|water"]({B});
 way["leisure"~"park|pitch|garden|track|playground|stadium|sports_centre"]({B});
 way["amenity"="parking"]({B});
 way["area:highway"]({B});
 way["natural"="tree_row"]({B}); node["natural"="tree"]({B}););
out geom tags;'''
for i in range(8):
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request('https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q), headers={'User-Agent': 'ku-crimson-roar/1.0'}), timeout=240).read())
        break
    except Exception as e:
        print('retry', e, file=sys.stderr); time.sleep(12)
json.dump(d, open(os.path.join(HERE, 'land.json'), 'w'), ensure_ascii=False)
from collections import Counter
c = Counter()
for e in d['elements']:
    t = e.get('tags', {})
    c[(e['type'], t.get('landuse') or t.get('natural') or t.get('leisure') or t.get('amenity') or 'other')] += 1
print(c.most_common(30))
