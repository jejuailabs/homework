'use client';
import {useEffect,useRef} from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {mapBounds,type MapCenter,type NeighborhoodPlace} from '@/lib/neighborhood';
import {SPOT_KINDS,placeGroup,spotKind} from '@/lib/neighborhood-spots';

export type LiveMapLayer='base'|'satellite';
type Props={center:MapCenter;places:NeighborhoodPlace[];layer:LiveMapLayer;adding:boolean;onPick:(point:{lat:number;lon:number})=>void;onMove:(id:string,point:{lat:number;lon:number})=>void;label:string};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

/** Real VWorld base map (proxied tiles) centred on the school, with the lesson places as draggable pins. */
export default function NeighborhoodLiveMap({center,places,layer,adding,onPick,onMove,label}:Props){
  const host=useRef<HTMLDivElement>(null),state=useRef<{L:typeof Leaflet;map:Leaflet.Map;tiles:Leaflet.TileLayer;area:Leaflet.Rectangle;pins:Leaflet.LayerGroup}|null>(null);
  const handlers=useRef({onPick,onMove,adding});handlers.current={onPick,onMove,adding};
  const latest=useRef({center,places,layer});latest.current={center,places,layer};
  useEffect(()=>{let cancelled=false;
    import('leaflet').then(L=>{if(cancelled||!host.current)return;
      const map=L.map(host.current,{zoomControl:true,attributionControl:true,minZoom:7,maxZoom:19,scrollWheelZoom:false});
      map.attributionControl.setPrefix(false);
      const tiles=L.tileLayer('/api/neighborhood/tile/{layer}/{z}/{y}/{x}',{layer:latest.current.layer,maxZoom:19,minZoom:7,attribution:'© 브이월드(국토교통부)'} as Leaflet.TileLayerOptions).addTo(map);
      const area=L.rectangle([[0,0],[0,0]],{color:'#3f7d58',weight:2,dashArray:'6 6',fill:false,interactive:false}).addTo(map);
      const pins=L.layerGroup().addTo(map);
      map.on('click',event=>{if(handlers.current.adding)handlers.current.onPick({lat:event.latlng.lat,lon:event.latlng.lng});});
      map.on('focus',()=>map.scrollWheelZoom.enable());map.on('blur',()=>map.scrollWheelZoom.disable());
      state.current={L,map,tiles,area,pins};draw();frame();
    });
    return()=>{cancelled=true;state.current?.map.remove();state.current=null;};
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  function frame(){const s=state.current;if(!s)return;const [w,south,e,n]=mapBounds(latest.current.center);s.area.setBounds([[south,w],[n,e]]);s.map.fitBounds([[south,w],[n,e]],{padding:[12,12]});}
  function draw(){const s=state.current;if(!s)return;s.pins.clearLayers();let number=0;
    for(const place of latest.current.places){const kind=spotKind(place.kind)??'other',school=place.id==='school',info=SPOT_KINDS[kind],group=placeGroup(place);if(place.selected&&!school)number++;
      const icon=s.L.divIcon({className:'',iconSize:school?[46,46]:[36,36],iconAnchor:school?[23,23]:[18,18],html:`<span class="nb-pin nb-pin-${group}${place.selected?'':' off'}${school?' school':''}"><b aria-hidden="true">${info.icon}</b>${place.selected&&!school?`<i>${number}</i>`:''}</span>`});
      const marker=s.L.marker([place.lat,place.lon],{icon,draggable:!school,keyboard:true,title:place.name,riseOnHover:true,zIndexOffset:school?1000:place.selected?500:0});
      marker.bindTooltip(`<strong>${escape(place.name)}</strong><br>${escape(place.category)}`,{direction:'top',offset:[0,-16]});
      marker.on('dragend',()=>{const point=marker.getLatLng();handlers.current.onMove(place.id,{lat:point.lat,lon:point.lng});});
      marker.addTo(s.pins);}
  }
  useEffect(()=>{draw();},[places]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{frame();},[center.lat,center.lon,center.radius]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const s=state.current;if(!s)return;(s.tiles.options as Leaflet.TileLayerOptions&{layer:string}).layer=layer;s.tiles.redraw();s.area.setStyle({color:layer==='satellite'?'#ffffff':'#3f7d58'});},[layer]);
  return <div ref={host} className={'neighborhood-live-map'+(adding?' adding':'')} role="application" aria-label={label}/>;
}
