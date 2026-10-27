"""Build the local continuous-map fixture from an existing OSM XML extract.

No network calls. Coordinates are never artistically moved. The result is a
game rendering fixture, not a verified pedestrian navigation recommendation.
Usage: python scripts/prepare-continuous-map.py SOURCE.osm [OUTPUT.json]
"""
import datetime
import hashlib
import heapq
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = {"lat": 33.46512, "lon": 126.32235}
R = 6371008.8
COS = math.cos(math.radians(ORIGIN["lat"]))

def xy(lat, lon):
    return {"x": round(math.radians(lon - ORIGIN["lon"]) * R * COS, 3),
            "y": round(-math.radians(lat - ORIGIN["lat"]) * R, 3)}

def dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])

def nearest_on_segment(p, a, b):
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    t = max(0, min(1, ((p["x"]-a["x"])*dx+(p["y"]-a["y"])*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
    return {"x": a["x"] + dx*t, "y": a["y"] + dy*t}

def clip_polygon(points, extent):
    """Sutherland-Hodgman clipping; coast coordinates inside the extent stay exact."""
    output = list(points)
    for axis,bound,keep_greater in [("x",extent["minX"],True),("x",extent["maxX"],False),("y",extent["minY"],True),("y",extent["maxY"],False)]:
        previous_output, output = output, []
        if not previous_output: break
        a = previous_output[-1]
        inside = lambda p: p[axis]>=bound if keep_greater else p[axis]<=bound
        for b in previous_output:
            ai,bi = inside(a),inside(b)
            if ai != bi:
                t=(bound-a[axis])/(b[axis]-a[axis])
                output.append({"x":a["x"]+(b["x"]-a["x"])*t,"y":a["y"]+(b["y"]-a["y"])*t})
            if bi: output.append(b)
            a=b
    return [{k:round(v,3) for k,v in p.items()} for p in output]

def build(source):
    raw = Path(source).read_bytes()
    root = ET.fromstring(raw)
    nodes = {n.attrib["id"]: xy(float(n.attrib["lat"]), float(n.attrib["lon"])) for n in root.findall("node")}
    original = {n.attrib["id"]: {"lat": float(n.attrib["lat"]), "lon": float(n.attrib["lon"])} for n in root.findall("node")}
    ways = []
    for w in root.findall("way"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in w.findall("tag")}
        refs = [n.attrib["ref"] for n in w.findall("nd") if n.attrib["ref"] in nodes]
        if len(refs) >= 2:
            ways.append({"id": w.attrib["id"], "tags": tags, "refs": refs, "points": [nodes[n] for n in refs]})
    excluded = {"motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed"}
    roads = [w for w in ways if w["tags"].get("highway") and w["tags"]["highway"] not in excluded
             and w["tags"].get("foot") not in {"no", "private"} and w["tags"].get("access") not in {"no", "private"}]
    graph, edges = {}, []
    def link(a, b, distance):
        graph.setdefault(a, []).append((b, distance)); graph.setdefault(b, []).append((a, distance))
    for road in roads:
        for a, b in zip(road["refs"], road["refs"][1:]):
            length = dist(nodes[a], nodes[b])
            if length:
                link(a, b, length); edges.append((a, b, road["id"]))
    landmarks = []
    identities = {"애월초등학교": "school", "애월우체국": "post", "애월항": "harbor"}
    for element in list(root.findall("way")) + list(root.findall("node")):
        tags = {t.attrib["k"]: t.attrib["v"] for t in element.findall("tag")}
        if tags.get("name") not in identities: continue
        refs = [n.attrib["ref"] for n in element.findall("nd")] if element.tag == "way" else [element.attrib["id"]]
        refs = [r for r in refs if r in original]
        if len(refs)>1 and refs[0] == refs[-1]: refs=refs[:-1]
        lat = sum(original[r]["lat"] for r in refs)/len(refs)
        lon = sum(original[r]["lon"] for r in refs)/len(refs)
        p = xy(lat, lon)
        best = min(((dist(p, q:=nearest_on_segment(p, nodes[a], nodes[b])), a, b, way_id, q) for a,b,way_id in edges), key=lambda v: v[0])
        distance,a,b,way_id,q = best
        key = "landmark:" + identities[tags["name"]]
        nodes[key] = q; link(key,a,dist(q,nodes[a])); link(key,b,dist(q,nodes[b]))
        landmarks.append({"id": identities[tags["name"]], "name": tags["name"], "osmId": f'{element.tag}/{element.attrib["id"]}',
                          "point": p, "lat": lat, "lon": lon, "roadPoint": {k:round(v,3) for k,v in q.items()},
                          "roadOffsetMeters": round(distance,2), "roadWayId":way_id,
                          "note":"OSM place centroid; nearest road point is not a verified entrance."})
    def route_to(destination):
        start, goal = "landmark:school", "landmark:" + destination
        distances, previous, queue = {start:0}, {}, [(0,start)]
        while queue:
            d, here = heapq.heappop(queue)
            if d != distances.get(here): continue
            if here == goal: break
            for there, length in graph[here]:
                nd = d+length
                if nd < distances.get(there,math.inf):
                    distances[there]=nd; previous[there]=here; heapq.heappush(queue,(nd,there))
        if goal not in distances: raise ValueError("No connected path for " + goal)
        route = [goal]
        while route[-1] != start: route.append(previous[route[-1]])
        route.reverse()
        return {"from":"school","to":destination,"lengthMeters":round(distances[goal],2),
                "nodeIds":route, "points":[{k:round(v,3) for k,v in nodes[n].items()} for n in route]}
    paths = {dest:route_to(dest) for dest in ["post","harbor"]}
    coast_ways = [w for w in ways if w["tags"].get("natural")=="coastline"]
    harbor_route = paths["harbor"]
    cumulative = [0]
    for a,b in zip(harbor_route["points"],harbor_route["points"][1:]): cumulative.append(cumulative[-1]+dist(a,b))
    coast_index = next(i for i,p in enumerate(harbor_route["points"]) if cumulative[i]>=350 and
                       min(dist(p,nearest_on_segment(p,a,b)) for w in coast_ways for a,b in zip(w["points"],w["points"][1:]))<20)
    route = {**harbor_route,"to":"coast","name":"애월초 인근 도로 → 해안 도착점",
             "points":harbor_route["points"][:coast_index+1],"nodeIds":harbor_route["nodeIds"][:coast_index+1],
             "lengthMeters":round(cumulative[coast_index],2)}
    paths["coast"] = route
    start = route["points"][0]
    school = next(l for l in landmarks if l["id"]=="school")
    start_edge = next((a,b) for a,b,wid in edges if wid==school["roadWayId"] and dist(start,nearest_on_segment(start,nodes[a],nodes[b]))<0.002)
    next_node = route["nodeIds"][1]
    school_way = next(w for w in roads if w["id"]==school["roadWayId"])
    before_id = start_edge[1] if start_edge[0]==next_node else start_edge[0]
    before_index = school_way["refs"].index(before_id)
    step = 1 if start_edge[0]==next_node else -1
    before_points = [start]+[nodes[school_way["refs"][i]] for i in range(before_index,len(school_way["refs"]) if step>0 else -1,step)]
    # Start west of the school sprite while remaining on the unchanged road.
    remaining, spawn = 45, start
    for a,b in zip(before_points,before_points[1:]):
        length=dist(a,b)
        if length>=remaining:
            spawn={k:round(a[k]+(b[k]-a[k])*remaining/length,3) for k in ["x","y"]};break
        remaining-=length;spawn=b
    middle_index = 14
    stops = [{"id":"school","name":"학교 앞 출발점","point":start,"routeIndex":0,"distanceMeters":0,"kind":"departure"},
             {"id":"bend","name":"길의 굽이","point":route["points"][middle_index],"routeIndex":middle_index,"distanceMeters":round(cumulative[middle_index],2),"kind":"clue"},
             {"id":"coast","name":"해안 도착점","point":route["points"][-1],"routeIndex":coast_index,"distanceMeters":route["lengthMeters"],"kind":"destination"}]
    landmarks.append({"id":"coast","name":"해안 도착점","point":route["points"][-1],"roadPoint":route["points"][-1],"roadOffsetMeters":0,"osmNodeId":route["nodeIds"][-1],"note":"Demo stop on an unchanged OSM road node, not an official named landmark."})
    # Keep a geographical rectangle around the actual route, with useful shore context.
    ps = route["points"]
    extent = {"minX":math.floor(min(p["x"] for p in ps)-160), "minY":math.floor(min(p["y"] for p in ps)-160),
              "maxX":math.ceil(max(p["x"] for p in ps)+160), "maxY":math.ceil(max(p["y"] for p in ps)+160)}
    def intersects(points):
        return max(p["x"] for p in points)>=extent["minX"] and min(p["x"] for p in points)<=extent["maxX"] and max(p["y"] for p in points)>=extent["minY"] and min(p["y"] for p in points)<=extent["maxY"]
    road_data = [{"id":w["id"], "name":w["tags"].get("name",""),"highway":w["tags"]["highway"],
                  "points":w["points"], "nodeIds":w["refs"], "surface":w["tags"].get("surface"),
                  "foot":w["tags"].get("foot"), "access":w["tags"].get("access")} for w in roads if intersects(w["points"])]
    buildings = [{"id":w["id"],"points":w["points"],"kind":w["tags"].get("building"),
                  "landmarkId":identities.get(w["tags"].get("name"))} for w in ways if "building" in w["tags"] and intersects(w["points"])]
    polygons = [{"id":w["id"], "points":w["points"],"kind":w["tags"].get("landuse",w["tags"].get("leisure",w["tags"].get("amenity")))} for w in ways
                if any(k in w["tags"] for k in ["landuse","leisure"]) or w["tags"].get("amenity")=="school"]
    polygons = [w for w in polygons if intersects(w["points"])]
    coastlines = [{"id":w["id"],"points":w["points"],"orientation":"land-on-left-in-OSM-lon-lat"} for w in ways if w["tags"].get("natural")=="coastline" and intersects(w["points"])]
    # This Aewol extract's two coastline ways connect east to west. The sea is
    # north of this continuous coast; close outside all geometry, then clip.
    remaining_coasts = list(coastlines)
    first = next(c for c in remaining_coasts if not any(other["points"][-1]==c["points"][0] for other in remaining_coasts if other is not c))
    joined = list(first["points"]); remaining_coasts.remove(first)
    while remaining_coasts:
        match=next((c for c in remaining_coasts if c["points"][0]==joined[-1]),None)
        if not match: raise ValueError("Coastline connectivity changed; inspect sea fill before using this fixture.")
        joined.extend(match["points"][1:]); remaining_coasts.remove(match)
    top=min(p["y"] for p in joined)-100
    left=min(p["x"] for p in joined)-100
    right=max(p["x"] for p in joined)+100
    sea_ring=joined+[{"x":left,"y":joined[-1]["y"]},{"x":left,"y":top},{"x":right,"y":top},{"x":right,"y":joined[0]["y"]}]
    sea_polygons=[{"id":"aewol-north-sea","points":clip_polygon(sea_ring,extent),"sourceWayIds":[c["id"] for c in coastlines],"note":"Original coastline joined in OSM order; northern ocean closed outside the sample and clipped to extent."}]
    return {"version":1,"name":"애월초에서 해안까지", "projection":{"kind":"local-equirectangular","origin":ORIGIN,"earthRadiusMeters":R,"axes":{"x":"east","y":"south"},"units":"meters","northUp":True},
            "extent":extent,"selectedRoute":"coast","spawn":spawn,"stops":stops,"route":route,"alternativeRoutes":paths,"landmarks":landmarks,"roads":road_data,"buildings":buildings,"polygons":polygons,"coastlines":coastlines,"seaPolygons":sea_polygons,
            "source":{"provider":"OpenStreetMap","attribution":"© OpenStreetMap contributors","license":"ODbL 1.0","copyrightUrl":"https://www.openstreetmap.org/copyright","downloadEndpoint":"https://api.openstreetmap.org/api/0.6/map", "bbox":dict(root.find("bounds").attrib),"sourceSha256":hashlib.sha256(raw).hexdigest(),"retrievedAt":"2026-10-27","preparedAt":datetime.date.today().isoformat(),"sourceFile":"map1km.osm", "routeMethod":"Shortest undirected OSM road-node path; foot=no/private and access=no/private excluded; endpoints projected to nearest road segment.","limitations":["The route is for an in-game prototype, not real-world walking guidance.","Not all sidewalks, crossings, access restrictions or building entrances are mapped or verified.","Building shapes and land cover are incomplete. Decorative art is illustrative, not surveyed geometry.","3-decimal meter rounding only; no artistic relocation of road coordinates."]}}

if __name__ == "__main__":
    if len(sys.argv)<2: raise SystemExit(__doc__)
    result = build(sys.argv[1])
    target = Path(sys.argv[2]) if len(sys.argv)>2 else ROOT / "continuous/data/aewol.json"
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(json.dumps({"output":str(target),"extent":result["extent"],"routes":{k:v["lengthMeters"] for k,v in result["alternativeRoutes"].items()},"landmarks":result["landmarks"],"counts":{k:len(result[k]) for k in ["roads","buildings","polygons","coastlines"]}},ensure_ascii=True,indent=2))
