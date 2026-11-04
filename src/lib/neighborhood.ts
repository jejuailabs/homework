export type MapCenter = {lat: number; lon: number; radius: number};
export type MapLine = {id: string; kind: 'road' | 'water' | 'boundary'; name: string; points: [number, number][]};
export type NeighborhoodPlace = {id: string; name: string; category: string; kind?: string; lat: number; lon: number; sourceUrl: string; note: string; selected: boolean; verified: boolean};
export type NeighborhoodMap = {center: MapCenter; lines: MapLine[]; places: NeighborhoodPlace[]; attribution: string; sourceUrl: string; sourceDate: string; retrievedAt: string; source: 'osm' | 'vworld' | 'import'};
export type NeighborhoodPack = {version: 1; title: string; region: string; grade: string; unit: string; classId: string; map: NeighborhoodMap | null; brief: string; teacherNotes: string; sources: {title: string; url: string}[]; referenceDate: string};
export const NEIGHBORHOOD_PRESETS = [{id: 'jeju', ko: '제주시 중심', en: 'Central Jeju', lat: 33.4996, lon: 126.5312}, {id: 'seoul', ko: '서울 도심', en: 'Central Seoul', lat: 37.5665, lon: 126.9780}, {id: 'busan', ko: '부산 도심', en: 'Central Busan', lat: 35.1796, lon: 129.0756}];
const record = (value: unknown): Record<string, unknown> => {if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID'); return value as Record<string, unknown>;};
const text = (value: unknown, max: number, blank = true) => {if (typeof value !== 'string' || value.length > max || (!blank && !value.trim())) throw new Error('INVALID'); return value.trim();};
const number = (value: unknown, min: number, max: number) => {if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('INVALID'); return value;};
export const neighborhoodUrl = (value: unknown) => {const url = text(value, 1000); if (!url) return ''; try {const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); return url;} catch {throw new Error('INVALID_URL');}};
export function validateMapCenter(value: unknown): MapCenter {const input = record(value); return {lat: number(input.lat, 32, 39), lon: number(input.lon, 124, 132), radius: number(input.radius, 300, 1000)};}
export function mapBounds(center: MapCenter): [number, number, number, number] {const lat = center.radius / 111320, lon = lat / Math.cos(center.lat * Math.PI / 180); return [center.lon - lon, center.lat - lat, center.lon + lon, center.lat + lat];}
export function mapProject(center: MapCenter, lon: number, lat: number) {const [w,s,e,n] = mapBounds(center); return {x: 35 + (lon-w)/(e-w)*730, y: 30+(n-lat)/(n-s)*540};}
export function mapUnproject(center: MapCenter, x: number, y: number) {const [w,s,e,n] = mapBounds(center); return {lon:w+(x-35)/730*(e-w),lat:n-(y-30)/540*(n-s)};}
export function parseNeighborhoodMap(value: unknown): NeighborhoodMap {
  const input = record(value), center = validateMapCenter(input.center);
  if (!Array.isArray(input.lines) || input.lines.length > 450 || !Array.isArray(input.places) || input.places.length > 100) throw new Error('MAP_SIZE');
  let totalPoints = 0;
  const lines = input.lines.map(raw => {const line = record(raw); if (!['road','water','boundary'].includes(String(line.kind)) || !Array.isArray(line.points) || line.points.length < 2 || line.points.length > 200) throw new Error('MAP_LINE'); totalPoints += line.points.length;
    return {id:text(line.id,80,false),kind:line.kind as MapLine['kind'],name:text(line.name,100),points:line.points.map(rawPoint=>{if(!Array.isArray(rawPoint)||rawPoint.length!==2)throw new Error('MAP_POINT');return [number(rawPoint[0],120,136),number(rawPoint[1],28,43)] as [number,number];})};});
  if (totalPoints > 12000) throw new Error('MAP_SIZE');
  const places = input.places.map(raw => {const place=record(raw);if(typeof place.selected!=='boolean'||typeof place.verified!=='boolean')throw new Error('MAP_PLACE');const kind=place.kind===undefined?undefined:text(place.kind,20,false);if(kind!==undefined&&!/^[a-z]+$/.test(kind))throw new Error('MAP_PLACE');return {id:text(place.id,80,false),name:text(place.name,100,false),category:text(place.category,60),...(kind?{kind}:{}),lat:number(place.lat,32,39),lon:number(place.lon,124,132),sourceUrl:neighborhoodUrl(place.sourceUrl),note:text(place.note,1500),selected:place.selected,verified:place.verified};});
  if(new Set(places.map(place=>place.id)).size!==places.length)throw new Error('DUPLICATE_PLACE');
  if(places.filter(place=>place.selected).length>12)throw new Error('PLACE_SELECTION');
  if(input.source!=='osm'&&input.source!=='vworld'&&input.source!=='import')throw new Error('MAP_SOURCE');
  return {center,lines,places,attribution:text(input.attribution,300,false),sourceUrl:neighborhoodUrl(input.sourceUrl),sourceDate:text(input.sourceDate,40),retrievedAt:text(input.retrievedAt,40),source:input.source};
}
export function validateNeighborhoodPack(value: unknown): NeighborhoodPack {
  const input=record(value);if(input.version!==1||!Array.isArray(input.sources)||input.sources.length>30)throw new Error('PACK');
  const classId=text(input.classId??'',128);if(classId&&!/^[A-Za-z0-9_-]+$/.test(classId))throw new Error('CLASS');
  return {version:1,title:text(input.title,120,false),region:text(input.region,160,false),grade:text(input.grade,40),unit:text(input.unit,160),classId,map:input.map===null?null:parseNeighborhoodMap(input.map),brief:text(input.brief,25000),teacherNotes:text(input.teacherNotes,12000),sources:input.sources.map(raw=>{const source=record(raw);return {title:text(source.title,160),url:neighborhoodUrl(source.url)};}),referenceDate:text(input.referenceDate,40)};
}
/** Douglas–Peucker removes intermediate points only; it never generates road geometry. */
export function simplifyMapLine(points: [number,number][], epsilon = .00004): [number,number][] {
  if(points.length<3)return points;
  const first=points[0],last=points[points.length-1],dx=last[0]-first[0],dy=last[1]-first[1],length=dx*dx+dy*dy;
  let furthest=0,index=0;
  for(let i=1;i<points.length-1;i++){const point=points[i],t=length?Math.max(0,Math.min(1,((point[0]-first[0])*dx+(point[1]-first[1])*dy)/length)):0;const distance=Math.hypot(point[0]-(first[0]+t*dx),point[1]-(first[1]+t*dy));if(distance>furthest){furthest=distance;index=i;}}
  return furthest>epsilon?[...simplifyMapLine(points.slice(0,index+1),epsilon).slice(0,-1),...simplifyMapLine(points.slice(index),epsilon)]:[first,last];
}
/** VWorld (국토교통부 공간정보 오픈플랫폼) layers. Buildings are filtered by name because VWorld has no school/public-office point layer. */
type VworldLayer = {key: string; data: string; svcIde: string; attrFilter?: string; kind?: MapLine['kind']; category?: string; placeKind?: string; name?: string};
export const VWORLD_LAYERS: VworldLayer[] = [
  {key:'boundary',data:'LT_C_ADEMD_INFO',svcIde:'ademd',kind:'boundary',name:'emd_kor_nm'},
  {key:'water',data:'LT_C_WKMSTRM',svcIde:'wkmstrm',kind:'water',name:'riv_nm'},
  {key:'road',data:'LT_L_SPRD',svcIde:'sprd',kind:'road',name:'rn'},
  {key:'school',data:'LT_C_SPBD',svcIde:'spbd',attrFilter:'buld_nm:like:학교',category:'학교',placeKind:'school',name:'buld_nm'},
  {key:'office',data:'LT_C_SPBD',svcIde:'spbd',attrFilter:'buld_nm:like:행정복지센터',category:'공공·생활',placeKind:'office',name:'buld_nm'},
  {key:'library',data:'LT_C_SPBD',svcIde:'spbd',attrFilter:'buld_nm:like:도서관',category:'공공·생활',placeKind:'library',name:'buld_nm'},
  {key:'smallLibrary',data:'LT_P_SMALLLIBRARY',svcIde:'smalllibrary',category:'공공·생활',placeKind:'library',name:'lbr_name'},
  {key:'museum',data:'LT_P_DGMUSEUMART',svcIde:'dgmuseumart',category:'문화·탐방',placeKind:'museum',name:'mus_nam'},
  {key:'market',data:'LT_P_TRADSIJANG',svcIde:'tradsijang',category:'생활·시장',placeKind:'market',name:'name'},
  {key:'police',data:'LT_C_SPBD',svcIde:'spbd',attrFilter:'buld_nm:like:경찰',category:'공공·생활',placeKind:'police',name:'buld_nm'},
  {key:'fire',data:'LT_C_SPBD',svcIde:'spbd',attrFilter:'buld_nm:like:소방',category:'공공·생활',placeKind:'fire',name:'buld_nm'},
  {key:'post',data:'LT_C_SPBD',svcIde:'spbd',attrFilter:'buld_nm:like:우체국',category:'공공·생활',placeKind:'post',name:'buld_nm'},
  {key:'placeName',data:'LT_P_NSNMSSITENM',svcIde:'nsnmssitenm',category:'지명',placeKind:'other',name:'land_kpyo'},
];
export function vworldRequestUrl(layer: VworldLayer, center: MapCenter, key: string, domain: string) {
  const [w,s,e,n]=mapBounds(center),url=new URL('https://api.vworld.kr/req/data');
  const params:Record<string,string>={service:'data',version:'2.0',request:'GetFeature',data:layer.data,key,geomFilter:`BOX(${w.toFixed(6)},${s.toFixed(6)},${e.toFixed(6)},${n.toFixed(6)})`,size:'1000',page:'1',format:'json',errorFormat:'json',crs:'EPSG:4326'};
  if(domain)params.domain=domain;if(layer.attrFilter)params.attrFilter=layer.attrFilter;
  for(const [name,value] of Object.entries(params))url.searchParams.set(name,value);
  return url;
}
/** Returns the features of one VWorld GetFeature response; NOT_FOUND is an empty layer, ERROR carries VWorld's error code. */
export function vworldFeatures(value: unknown): Record<string, unknown>[] {
  const response=record(record(value).response);
  if(response.status==='NOT_FOUND')return [];
  if(response.status!=='OK'){const error=response.error&&typeof response.error==='object'?(response.error as Record<string,unknown>).code:'';throw new Error(`VWORLD_${typeof error==='string'?error:'ERROR'}`);}
  const features=record(record(response.result).featureCollection).features;if(!Array.isArray(features))throw new Error('VWORLD_FORMAT');
  return features.filter(feature=>feature&&typeof feature==='object') as Record<string,unknown>[];
}
const lonLat=(raw:unknown):[number,number]|null=>Array.isArray(raw)&&typeof raw[0]==='number'&&typeof raw[1]==='number'&&raw[1]>=28&&raw[1]<=43&&raw[0]>=120&&raw[0]<=136?[raw[0],raw[1]]:null;
/** Line parts and polygon outer rings, as provided by VWorld. */
function geometryParts(geometry: Record<string, unknown>): [number,number][][] {
  const coordinates=geometry.coordinates;if(!Array.isArray(coordinates))return [];
  const path=(raw:unknown)=>Array.isArray(raw)?raw.map(lonLat).filter((point):point is [number,number]=>!!point):[];
  if(geometry.type==='Point')return [path([coordinates])].filter(part=>part.length);
  if(geometry.type==='LineString'||geometry.type==='MultiPoint')return [path(coordinates)];
  if(geometry.type==='MultiLineString'||geometry.type==='Polygon')return geometry.type==='Polygon'?[path(coordinates[0])]:coordinates.map(path);
  if(geometry.type==='MultiPolygon')return coordinates.map(polygon=>Array.isArray(polygon)?path(polygon[0]):[]);
  return [];
}
/** Keeps the runs of a line near the map area (plus one point either side) so long boundaries keep their detail where they are drawn. */
function clipToArea(points: [number,number][], [w,s,e,n]: [number,number,number,number]): [number,number][][] {
  const padLon=(e-w)*.2,padLat=(n-s)*.2,inside=([lon,lat]:[number,number])=>lon>=w-padLon&&lon<=e+padLon&&lat>=s-padLat&&lat<=n+padLat;
  const runs:[number,number][][]=[];let run:[number,number][]=[];
  points.forEach((point,index)=>{if(inside(point)){if(!run.length&&index>0)run.push(points[index-1]);run.push(point);}else if(run.length){run.push(point);runs.push(run);run=[];}});
  if(run.length)runs.push(run);
  return runs.filter(part=>part.length>1);
}
export function parseVworldMap(responses: Record<string, unknown>, center: MapCenter, now: string): NeighborhoodMap {
  const bounds=mapBounds(center),[w,s,e,n]=bounds,lines:MapLine[]=[],places:NeighborhoodPlace[]=[],names=new Set<string>();let total=0;
  for(const layer of VWORLD_LAYERS){
    const features=vworldFeatures(responses[layer.key]),sourceUrl=`https://www.vworld.kr/dev/v4dv_2ddataguide2_s002.do?svcIde=${layer.svcIde}`;
    if(layer.kind){for(const [index,feature] of features.entries()){
      const props=feature.properties&&typeof feature.properties==='object'?feature.properties as Record<string,unknown>:{},name=typeof props[layer.name!]==='string'?(props[layer.name!] as string).slice(0,100):'';
      const parts=feature.geometry&&typeof feature.geometry==='object'?geometryParts(feature.geometry as Record<string,unknown>).flatMap(part=>clipToArea(part,bounds)):[];
      for(const [part,points] of parts.entries()){if(lines.length>=450)break;let simplified=simplifyMapLine(points);if(simplified.length>200)simplified=simplified.filter((_,i)=>i%Math.ceil(simplified.length/199)===0||i===simplified.length-1);if(total+simplified.length>12000)continue;lines.push({id:`${layer.key}-${index}-${part}`.slice(0,80),kind:layer.kind,name,points:simplified});total+=simplified.length;}
    }continue;}
    // One school can be several address buildings; group them by name and place the pin at their average position.
    const grouped=new Map<string,[number,number][]>();
    for(const feature of features){const props=feature.properties&&typeof feature.properties==='object'?feature.properties as Record<string,unknown>:{},name=typeof props[layer.name!]==='string'?(props[layer.name!] as string).trim().slice(0,100):'';
      const points=feature.geometry&&typeof feature.geometry==='object'?geometryParts(feature.geometry as Record<string,unknown>).flat():[];
      if(name&&points.length)grouped.set(name,[...(grouped.get(name)??[]),[points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length]]);}
    for(const [name,points] of grouped){const lon=points.reduce((sum,p)=>sum+p[0],0)/points.length,lat=points.reduce((sum,p)=>sum+p[1],0)/points.length;
      if(names.has(name)||lat<s||lat>n||lon<w||lon>e||places.length>=80)continue;names.add(name);
      places.push({id:`vworld-${layer.key}-${places.length}`,name,category:layer.category!,...(layer.placeKind?{kind:layer.placeKind}:{}),lat,lon,sourceUrl,note:'',selected:places.length<10,verified:false});}
  }
  if(!lines.length&&!places.length)throw new Error('MAP_EMPTY');
  return parseNeighborhoodMap({center,lines,places,source:'vworld',attribution:'브이월드 공간정보 오픈플랫폼(국토교통부)',sourceUrl:'https://www.vworld.kr',sourceDate:now,retrievedAt:now});
}
export function importNeighborhoodGeoJson(value: unknown, center: MapCenter, attribution: string, sourceUrl: string, now: string): NeighborhoodMap {
  const raw=record(value);if(raw.type!=='FeatureCollection'||!Array.isArray(raw.features)||raw.features.length>500)throw new Error('GEOJSON');
  const lines:MapLine[]=[],places:NeighborhoodPlace[]=[];
  for(const [index,feature] of raw.features.entries()){
    const item=record(feature),geometry=record(item.geometry),props=item.properties&&typeof item.properties==='object'?item.properties as Record<string,unknown>:{};
    const name=typeof props.name==='string'?props.name.slice(0,100):`장소 ${index+1}`;
    if(geometry.type==='Point'&&Array.isArray(geometry.coordinates)){const [lon,lat]=geometry.coordinates;places.push({id:`import-${index}`,name,category:typeof props.category==='string'?props.category.slice(0,60):'직접 가져온 장소',lon:number(lon,124,132),lat:number(lat,32,39),sourceUrl:neighborhoodUrl(props.sourceUrl??sourceUrl),note:'',selected:places.length<10,verified:false});}
    else if(geometry.type==='LineString'||geometry.type==='Polygon'){
      const coordinates=geometry.type==='Polygon'&&Array.isArray(geometry.coordinates)?geometry.coordinates[0]:geometry.coordinates;
      if(!Array.isArray(coordinates)||coordinates.length>4000)throw new Error('GEOJSON_SIZE');
      const points=coordinates.map(point=>{if(!Array.isArray(point))throw new Error('GEOJSON_POINT');return [number(point[0],120,136),number(point[1],28,43)] as [number,number];});
      const kind:MapLine['kind']=props.kind==='water'?'water':props.kind==='boundary'||geometry.type==='Polygon'?'boundary':'road';
      lines.push({id:`import-${index}`,name,kind,points:simplifyMapLine(points)});
    } else throw new Error('GEOJSON_GEOMETRY');
  }
  if(!lines.length&&!places.length)throw new Error('GEOJSON_EMPTY');
  return parseNeighborhoodMap({center,lines,places,attribution,sourceUrl,sourceDate:now,retrievedAt:now,source:'import'});
}
export function neighborhoodSvg(map: NeighborhoodMap, blank = false) {
  const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
  const lines=map.lines.map(line=>`<polyline fill="none" stroke="${line.kind==='water'?'#80b9d0':line.kind==='boundary'?'#b49bc8':'#d4c9ad'}" stroke-width="${line.kind==='water'?5:line.kind==='boundary'?2:3}" ${line.kind==='boundary'?'stroke-dasharray="7 5"':''} points="${line.points.map(([lon,lat])=>{const point=mapProject(map.center,lon,lat);return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;}).join(' ')}"/>`).join('');
  const points=map.places.filter(place=>place.selected).map((place,index)=>{const point=mapProject(map.center,place.lon,place.lat);return `<g><circle cx="${point.x}" cy="${point.y}" r="12" fill="#557c5c" stroke="white" stroke-width="2"/><text x="${point.x}" y="${point.y+4}" fill="white" text-anchor="middle" font-size="11">${index+1}</text>${blank?'':`<text x="${point.x+17}" y="${point.y+4}" fill="#314b36" font-size="11" paint-order="stroke" stroke="#fffef8" stroke-width="3">${escape(place.name)}</text>`}</g>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 630" role="img" aria-label="우리 동네 약도"><rect width="800" height="630" fill="#fffef8" rx="16"/><defs><clipPath id="map-crop"><rect x="25" y="20" width="750" height="560"/></clipPath></defs><g clip-path="url(#map-crop)">${lines}${points}</g><text x="752" y="38" font-size="14" fill="#49664e">N ↑</text><path d="M35 588h182.5m-182.5-5v10m182.5-10v10" stroke="#49664e" fill="none"/><text x="35" y="609" font-size="10" fill="#49664e">${map.center.radius/2} m</text><text x="765" y="612" text-anchor="end" font-size="9" fill="#627366">${escape(map.attribution)}</text></svg>`;
}
