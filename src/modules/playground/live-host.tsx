'use client';
import PlayRoomScreen from './room';
export default function LiveHost({roomId,fromCards=false}:{roomId:string;fromCards?:boolean}) {return <PlayRoomScreen codeOrId={roomId} teacher fromCards={fromCards}/>;}
