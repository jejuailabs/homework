import {createServer} from 'node:http';import {initializeApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';import {getStorage} from 'firebase-admin/storage';
import {processVideoJob} from './processor.mjs';
import {processExportPart} from './exporter.mjs';
const app=initializeApp({projectId:process.env.GOOGLE_CLOUD_PROJECT||process.env.FIREBASE_PROJECT_ID,storageBucket:process.env.VIDEO_STORAGE_BUCKET}),db=getFirestore(app),bucket=getStorage(app).bucket();
createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health'){res.writeHead(200);res.end('ok');return;}
 if(req.method!=='POST'||!['/process','/export-part'].includes(req.url)){res.writeHead(404);res.end();return;}
 try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024){res.writeHead(413);res.end();return;}}const body=JSON.parse(raw);if(req.url==='/export-part'){await processExportPart({db,bucket},String(body.exportId),body.part);res.writeHead(200);res.end('ok');return;}if(typeof body.jobId!=='string'||!Number.isInteger(body.retryVersion)||body.retryVersion<0)throw Error('BAD_INPUT');await processVideoJob({db,bucket},body.jobId,body.retryVersion);res.writeHead(200);res.end('ok');}
 catch(error){console.error('video task failed',{code:error.code||'INTERNAL'});res.writeHead(error.retryable?503:400);res.end('video task failed');}
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
