'use client';
import {useEffect,useState} from 'react';
import {CanvasModel,decodeCanvasUpdate} from '@/lib/canvas-document';
import {useClassroom} from './classroom-shared';
import CanvasEditor from './canvas-editor';
export default function LocalCanvas({pencils=false}:{pencils?:boolean}) {
  const {scope,en}=useClassroom(),[model,setModel]=useState<CanvasModel|null>(null),[notice,setNotice]=useState('');
  useEffect(()=>{
    const key=scope?`homework:canvas:v1:${scope}:${pencils?'pencils':'board'}`:null;let model:CanvasModel,dirty=false;let saved:string|null=null;
    try{saved=key?localStorage.getItem(key):null;model=new CanvasModel(saved?decodeCanvasUpdate(saved):undefined);}catch{if(saved&&key)try{localStorage.setItem(key+':unreadable',saved);}catch{}model=new CanvasModel();setNotice(en?'Could not load your saved drawing. Your earlier file is still kept.':'저장된 판서를 읽지 못했어요. 기존 데이터는 보관되어 있어요.');}
    if(!saved&&scope)try{const prefix=`homework:classroom:v1:${encodeURIComponent(scope)}:`;for(let index=0;index<localStorage.length;index++){const oldKey=localStorage.key(index)!;if(!oldKey.startsWith(prefix)||!(pencils?/pencil/i.test(oldKey):/board|drawing/i.test(oldKey)&&!/pencil/i.test(oldKey)))continue;const strokes=JSON.parse(localStorage.getItem(oldKey)||'null');if(!Array.isArray(strokes)||!strokes.length||strokes.length>400||!strokes.every(stroke=>stroke&&Array.isArray(stroke.points)&&stroke.points.length<=2000&&stroke.points.every((point:{x:number;y:number})=>Number.isFinite(point.x)&&Number.isFinite(point.y))))continue;const xs=strokes.flatMap(stroke=>stroke.points.map((point:{x:number})=>point.x)),ys=strokes.flatMap(stroke=>stroke.points.map((point:{y:number})=>point.y)),maxX=xs.reduce((n,value)=>Math.max(n,value),0),maxY=ys.reduce((n,value)=>Math.max(n,value),0),normalized=maxX<=1&&maxY<=1,scale=normalized?1:Math.min(1,1200/Math.max(1,maxX),720/Math.max(1,maxY));for(const stroke of strokes)model.add({type:'stroke',color:stroke.color,width:stroke.width,points:stroke.points.flatMap((point:{x:number;y:number})=>[point.x*(normalized?1200:scale),point.y*(normalized?720:scale)])});dirty=true;break;}}catch{}
    let timer:ReturnType<typeof setTimeout>|undefined;const save=()=>{if(!key||!dirty)return;try{localStorage.setItem(key,model.serialize());}catch{setNotice(en?'Browser storage is full. Download your editable document to keep it.':'기기 저장 공간이 부족해요. 편집 원본을 내려받아 보관해 주세요.');}};
    const changed=()=>{dirty=true;clearTimeout(timer);timer=setTimeout(save,500);};model.doc.on('update',changed);setModel(model);
    return()=>{model.finishEditing();clearTimeout(timer);save();model.doc.off('update',changed);model.destroy();};
  },[scope,pencils,en]);
  return <>{model&&<CanvasEditor key={`${scope}:${pencils}`} model={model} english={en} pencils={pencils}/>}<p className="classroom-hint">{en?'Saved on this browser. Download the editable document to move to another device.':'이 브라우저에 자동 저장돼요. 다른 기기에서는 편집 원본을 불러와 이어서 쓸 수 있어요.'}</p>{notice&&<p role="status">{notice}</p>}</>;
}
