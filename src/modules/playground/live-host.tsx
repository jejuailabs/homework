'use client';
import PlayRoomScreen from './room';
export default function LiveHost({roomId}:{roomId:string}) {return <PlayRoomScreen codeOrId={roomId} teacher/>;}
