import json, sys, time, urllib.parse, urllib.request
B = '37.5800,127.0200,37.5970,127.0420'  # the Anam campus + surroundings
q = f'''[out:json][timeout:120];
(way["building"]({B}); relation["building"]({B});
 way["highway"]({B});
 way["amenity"="university"]({B}); relation["amenity"="university"]({B});
 node["name"]({B}););
out geom tags;'''
for i in range(8):
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request('https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q), headers={'User-Agent': 'ku-crimson-roar/1.0'}), timeout=180).read())
        break
    except Exception as e:
        print('retry', e, file=sys.stderr); time.sleep(10)
json.dump(d, open('osm.json', 'w'), ensure_ascii=False)
els = d['elements']
print('elements', len(els))
