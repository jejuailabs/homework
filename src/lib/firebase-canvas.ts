'use client';
import {connectFirestoreEmulator,getFirestore} from 'firebase/firestore';
import {firebaseApp} from './firebase-client';
export const canvasFirestore=getFirestore(firebaseApp);
if(process.env.NODE_ENV!=='production'&&process.env.NEXT_PUBLIC_FIREBASE_EMULATORS==='true'){
  const state=globalThis as typeof globalThis&{__homeworkCanvasEmulator?:boolean};
  if(!state.__homeworkCanvasEmulator){connectFirestoreEmulator(canvasFirestore,'127.0.0.1',8080);state.__homeworkCanvasEmulator=true;}
}
