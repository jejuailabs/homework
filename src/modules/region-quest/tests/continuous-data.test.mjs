import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../continuous/data/aewol.json', import.meta.url), 'utf8'));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function segmentDistance(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=dx*dx+dy*dy ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy))) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function inPolygon(p,points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

test('selected continuous route retains real OSM nodes and connected road segments', () => {
  assert.equal(data.selectedRoute,'coast');
  const {points,nodeIds}=data.route;
  assert.equal(points.length,nodeIds.length);
  assert.equal(points.length,28);
  const sourceNodes = new Map();
  const sourceEdges = new Set();
  for(const road of data.roads) {
    road.nodeIds.forEach((id,i)=>sourceNodes.set(id,road.points[i]));
    for(let i=1;i<road.nodeIds.length;i++)sourceEdges.add([road.nodeIds[i-1],road.nodeIds[i]].sort().join(':'));
  }
  for(let i=1;i<points.length;i++)assert.deepEqual(points[i],sourceNodes.get(nodeIds[i]),`OSM node ${nodeIds[i]} is not moved`);
  for(let i=2;i<points.length;i++)assert.ok(sourceEdges.has([nodeIds[i-1],nodeIds[i]].sort().join(':')),'route must use a real road edge');
  const schoolRoad=data.roads.find(r=>r.id===data.landmarks.find(l=>l.id==='school').roadWayId);
  assert.ok(schoolRoad.points.some((p,i)=>i&&segmentDistance(points[0],schoolRoad.points[i-1],p)<0.002));
  const length=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
  assert.ok(Math.abs(length-data.route.lengthMeters)<0.01);
  assert.ok(length>400&&length<450);
});

test('map projection is north-up at one uniform meter scale and retains provenance', () => {
  const {origin,earthRadiusMeters}=data.projection;
  for(const place of data.landmarks.filter(p=>Number.isFinite(p.lat))) {
    const x=(place.lon-origin.lon)*Math.PI/180*earthRadiusMeters*Math.cos(origin.lat*Math.PI/180);
    const y=-(place.lat-origin.lat)*Math.PI/180*earthRadiusMeters;
    assert.ok(Math.abs(x-place.point.x)<0.001);
    assert.ok(Math.abs(y-place.point.y)<0.001);
  }
  assert.deepEqual(data.projection.axes,{x:'east',y:'south'});
  assert.equal(data.source.license,'ODbL 1.0');
  assert.match(data.source.sourceSha256,/^[0-9a-f]{64}$/);
  assert.equal(data.source.retrievedAt,'2026-10-27');
});

test('spawn and mission stops stay on the source road with a clear departure gap', () => {
  const segments=data.roads.flatMap(r=>r.points.slice(1).map((p,i)=>[r.points[i],p]));
  for(const p of [data.spawn,...data.stops.map(s=>s.point)]) {
    assert.ok(segments.some(([a,b])=>segmentDistance(p,a,b)<0.002));
    assert.ok(p.x>=data.extent.minX&&p.x<=data.extent.maxX&&p.y>=data.extent.minY&&p.y<=data.extent.maxY);
  }
  assert.ok(distance(data.spawn,data.stops[0].point)>40);
  assert.ok(distance(data.spawn,data.stops[0].point)<=45.001);
  assert.ok(data.spawn.x<data.stops[0].point.x-30,'spawn follows the road west and north of the tall school sprite');
  for(const stop of data.stops)assert.deepEqual(stop.point,data.route.points[stop.routeIndex]);
});

test('clipped sea fill contains northern water without flooding the walk route', () => {
  const {minX,minY,maxX,maxY}=data.extent;
  for(const poly of data.seaPolygons) {
    assert.ok(poly.points.length>=3);
    for(const p of poly.points)assert.ok(p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY);
    for(const p of data.route.points)assert.equal(inPolygon(p,poly.points),false);
  }
  assert.ok(data.seaPolygons.some(poly=>inPolygon({x:300,y:-300},poly.points)));
  assert.ok(data.seaPolygons.every(poly=>!inPolygon({x:0,y:0},poly.points)));
});

test('coastline join and western inlet preserve land under all mapped building centers', () => {
  assert.deepEqual(data.coastlines[0].points.at(-1),data.coastlines[1].points[0]);
  // The long narrow inlet west of the school is in the source OSM coastline;
  // it must remain water even though large decorative sprites can overhang it.
  assert.ok(data.seaPolygons.some(poly=>inPolygon({x:-120,y:-70},poly.points)));
  for(const building of data.buildings) {
    const closed=distance(building.points[0],building.points.at(-1))<0.001;
    const points=closed?building.points.slice(0,-1):building.points;
    const center={x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};
    assert.ok(data.seaPolygons.every(poly=>!inPolygon(center,poly.points)),`mapped building ${building.id} must remain on land`);
  }
});
