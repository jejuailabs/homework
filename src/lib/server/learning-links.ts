import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {NextResponse} from 'next/server';
import {bucket,db} from './admin';
import {assertOrigin,getContext,type Context} from './auth';
import {ApiError,canManageClass,id,text} from './policy';
import {BOARD_POST_LIMIT,changedReaction} from './participation-policy';
type Data=Record<string,any>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private,no-store'}});
const mapped=(doc:FirebaseFirestore.DocumentSnapshot):Data=>({...doc.data(),id:doc.id});
async function input(request:Request):Promise<Data>{const raw=await request.text();if(raw.length>50000)throw new ApiError(413,'입력 내용이 너무 길어요.');let value;try{value=JSON.parse(raw);}catch{throw new ApiError(400,'입력 내용을 확인해 주세요.');}if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'입력 내용을 확인해 주세요.');return value;}
async function managed(ctx:Context,classId:string){const cls=await db().doc(`classes/${id(classId)}`).get();if(!cls.exists||!canManageClass(ctx.role,ctx.uid,cls.data()?.ownerUid))throw new ApiError(403,'이 학급을 관리할 권한이 없어요.','FORBIDDEN');return cls;}
async function classAccess(ctx:Context,classId:string){if(ctx.role==='student'){if(ctx.classId!==classId)throw new ApiError(404,'우리 반 자료를 찾을 수 없어요.');}else await managed(ctx,classId);}
async function attachmentViews(items:Data[]=[],prefix?:string) {return Promise.all(items.map(async (item,index)=>{const [url]=await bucket().file(item.path).getSignedUrl({action:'read',expires:Date.now()+15*60_000});return{id:item.id,name:prefix?`${prefix} ${index+1}`:item.name,contentType:item.contentType,url};}));}
async function sourceCandidates(ctx:Context,kind:string,sourceId:string,classId:string) {
  await managed(ctx,classId);
  if(kind==='assignment'){
    const assignment=await db().doc(`assignments/${id(sourceId)}`).get();if(!assignment.exists||assignment.data()?.classId!==classId||assignment.data()?.ownerUid!==ctx.uid)throw new ApiError(404,'숙제를 찾을 수 없어요.');
    const rows=await db().collection('submissions').where('assignmentId','==',sourceId).limit(200).get();
    return rows.docs.filter(doc=>assignment.data()?.targetStudentIds?.includes(doc.data().studentId)).map(doc=>{const value=doc.data();return{id:doc.id,version:value.attemptId,title:assignment.data()!.title,body:value.text||'',authorName:value.studentName||'',attachments:(value.uploads||[]).map((upload:Data)=>({...upload,name:upload.fileName})),origin:{kind,assignmentId:sourceId,submissionId:doc.id,studentId:value.studentId}};});
  }
  if(kind==='board'){
    const board=await db().doc(`participationBoards/${id(sourceId)}`).get();if(!board.exists||board.data()?.ownerUid!==ctx.uid||board.data()?.classId!==classId||board.data()?.status==='archived')throw new ApiError(404,'참여보드를 찾을 수 없어요.');
    if(board.data()?.revealMode&&!board.data()?.revealed)throw new ApiError(409,'보드의 자료를 먼저 공개해 주세요.','SOURCE_HIDDEN');
    const posts=await board.ref.collection('posts').where('deleted','==',false).limit(500).get();return posts.docs.filter(doc=>doc.data().status==='published').map(doc=>{const value=doc.data();return{id:doc.id,version:String(value.version),title:value.title||'',body:value.body||'',authorName:value.authorName||'',attachments:value.attachments||[],origin:{kind,boardId:sourceId,postId:doc.id}};});
  }
  throw new ApiError(400,'숙제 또는 참여보드를 선택해 주세요.');
}
async function candidates(ctx:Context,request:Request){const query=new URL(request.url).searchParams,offset=Number(query.get('cursor')||0);if(!Number.isInteger(offset)||offset<0||offset>500)throw new ApiError(400,'목록 위치를 확인해 주세요.');const values=await sourceCandidates(ctx,query.get('kind')||'',id(query.get('sourceId')),id(query.get('classId')));return json({candidates:await Promise.all(values.slice(offset,offset+50).map(async value=>({...value,body:value.body.slice(0,600),origin:undefined,attachments:await attachmentViews(value.attachments.slice(0,3))}))),nextCursor:offset+50<values.length?String(offset+50):null});}

/** Publish a teacher-selected snapshot; immutable source files are retained rather than duplicated. */
async function publish(ctx:Context,request:Request){
  if(ctx.role==='student')throw new ApiError(403,'선생님만 게시할 수 있어요.');const value=await input(request),assignmentId=id(value.assignmentId),boardId=id(value.boardId);
  const assignmentDoc=await db().doc(`assignments/${assignmentId}`).get(),assignment=assignmentDoc.data();if(!assignmentDoc.exists)throw new ApiError(404,'숙제를 찾을 수 없어요.');await managed(ctx,assignment!.classId);
  const boardRef=db().doc(`participationBoards/${boardId}`),board=await boardRef.get();if(!board.exists||board.data()?.ownerUid!==ctx.uid||board.data()?.classId!==assignment!.classId||board.data()?.status==='archived')throw new ApiError(403,'같은 학급의 참여보드를 선택해 주세요.');
  if(!Array.isArray(value.submissions)||value.submissions.length>50||typeof value.includeGuide!=='boolean'||typeof value.hideNames!=='boolean')throw new ApiError(400,'게시할 자료를 다시 선택해 주세요.');
  const selections=value.submissions.map((item:Data)=>({id:id(item.id),version:id(item.version)}));if(new Set(selections.map((item:Data)=>item.id)).size!==selections.length)throw new ApiError(400,'같은 답안을 중복 선택했어요.');
  const rows:Data[]=[];
  if(value.includeGuide)rows.push({guide:true});for(const selected of selections)rows.push(selected);
  if(!rows.length)throw new ApiError(400,'게시할 숙제 안내나 제출물을 선택해 주세요.');
  let created=0,existing=0;
  for(const row of rows){
    const sourceDoc=row.guide?assignmentDoc:await db().doc(`submissions/${row.id}`).get();const source=sourceDoc.data();
    if(!sourceDoc.exists||(!row.guide&&(source?.assignmentId!==assignmentId||!assignment!.targetStudentIds.includes(source.studentId)||source.attemptId!==row.version)))throw new ApiError(409,'제출물이 변경됐어요. 목록을 새로 불러와 주세요.','SOURCE_CHANGED');
    const revision=row.guide?hash(JSON.stringify([assignment!.title,assignment!.description,(assignment!.materials||[]).map((item:Data)=>item.id)])):row.version;
    const postId=hash(`homework:${assignmentId}:${row.guide?'guide':row.id}:${revision}`),postRef=boardRef.collection('posts').doc(postId);
    const roster=row.guide?null:await db().doc(`classes/${assignment!.classId}/students/${source!.studentId}`).get();
    const person=row.guide?{authorUid:ctx.uid,authorRole:'teacher',authorName:ctx.displayName||'선생님',authorCharacter:'cat'}:{authorUid:roster?.data()?.authUid||`former-${source!.studentId}`,authorRole:'student',authorName:source!.studentName||roster?.data()?.name||'우리 반 작가',authorCharacter:roster?.data()?.character||'cat',authorStudentId:source!.studentId,authorNumber:roster?.data()?.number||0};
    const guideDocs:FirebaseFirestore.DocumentSnapshot[]=row.guide?await Promise.all((assignment!.materials||[]).map((item:Data)=>db().doc(`assignmentMaterials/${id(item.id)}`).get())):[];
    const attachments:Data[]=row.guide?guideDocs.map(doc=>{const item=doc.data();if(!item||item.assignmentId!==assignmentId||item.status!=='attached')throw new ApiError(409,'참고 자료가 변경됐어요. 새로 불러와 주세요.');return{id:doc.id,name:item.fileName,contentType:item.contentType,size:item.size,kind:item.contentType.startsWith('image/')?'image':'video',path:item.path};}):(source!.uploads||[]).map((item:Data)=>({id:item.id,name:item.fileName,contentType:item.contentType,size:item.size||0,kind:['image/jpeg','image/png','image/webp'].includes(item.contentType)?'image':item.contentType.startsWith('video/')?'video':'file',path:item.path}));
    const wasCreated=await db().runTransaction(async tx=>{
      const [freshBoard,previous,freshSource,participation,...materials]=await Promise.all([tx.get(boardRef),tx.get(postRef),tx.get(sourceDoc.ref),tx.get(boardRef.collection('participants').doc(hash(person.authorUid))),...guideDocs.map(doc=>tx.get(doc.ref))]);
      const fresh=freshBoard.data();if(!fresh||fresh.ownerUid!==ctx.uid||fresh.classId!==assignment!.classId||fresh.status==='archived')throw new ApiError(403,'보드 권한이 변경됐어요.');
      if(previous.exists){if(previous.data()?.deleted)throw new ApiError(409,'이 버전은 보드에서 삭제했어요. 보드의 기록을 확인해 주세요.');if(previous.data()?.sourceAnonymous!==value.hideNames){tx.update(postRef,{sourceAnonymous:value.hideNames,updatedAt:now()});tx.update(boardRef,{updatedAt:now()});}return false;}
      if(fresh.postCount>=BOARD_POST_LIMIT)throw new ApiError(409,'참여보드가 가득 찼어요.');
      if(!freshSource.exists||(!row.guide&&freshSource.data()?.attemptId!==row.version)||(row.guide&&hash(JSON.stringify([freshSource.data()?.title,freshSource.data()?.description,(freshSource.data()?.materials||[]).map((item:Data)=>item.id)]))!==revision))throw new ApiError(409,'숙제 자료가 변경됐어요. 새로 불러와 주세요.','SOURCE_CHANGED');
      for(const material of materials)if(material.data()?.status!=='attached'||material.data()?.assignmentId!==assignmentId)throw new ApiError(409,'자료가 변경됐어요.');
      const placement=(fresh.postSequence||0)%BOARD_POST_LIMIT,stamp=now();
      tx.create(postRef,{title:assignment!.title,body:row.guide?assignment!.description||'':source!.text||'',attachments,...person,sourceAnonymous:value.hideNames,source:{kind:'assignment',assignmentId,title:assignment!.title,version:revision,...(!row.guide?{submissionId:row.id}:{})},sectionId:'',color:fresh.theme,link:'',x:18+(placement%4)*320,y:18+Math.floor(placement/4)*600,location:null,poll:null,status:'published',pinned:false,order:Date.now(),reactionCounts:changedReaction(),commentCount:0,totalCommentWrites:0,deleted:false,version:1,createdAt:stamp,updatedAt:stamp});
      for(const material of materials)tx.update(material.ref,{boardReferences:FieldValue.increment(1)});
      const first=!(participation.data()?.postCount||participation.data()?.commentCount);tx.set(participation.ref,{...person,postCount:(participation.data()?.postCount||0)+1,commentCount:participation.data()?.commentCount||0,updatedAt:stamp});
      tx.update(boardRef,{postCount:(fresh.postCount||0)+1,postSequence:(fresh.postSequence||0)+1,participantCount:(fresh.participantCount||0)+(first&&person.authorRole==='student'?1:0),updatedAt:stamp});return true;
    });if(wasCreated)created++;else existing++;
  }
  return json({boardId,created,existing},201);
}
async function pollAccess(ctx:Context,pollId:string){const doc=await db().doc(`classPolls/${id(pollId)}`).get();if(!doc.exists)throw new ApiError(404,'투표를 찾을 수 없어요.');await classAccess(ctx,doc.data()!.classId);return doc;}
function closed(poll:Data){return poll.status==='closed'||(poll.closesAt&&Date.parse(poll.closesAt)<=Date.now());}
async function availability(poll:Data){
  if(poll.sourceKind!=='board')return new Map(poll.candidates.map((candidate:Data)=>[candidate.id,true]));
  const ref=db().doc(`participationBoards/${poll.sourceId}`);const [board,...posts]=await db().getAll(ref,...poll.candidates.map((candidate:Data)=>ref.collection('posts').doc(candidate.origin.postId)));
  const value=board.data(),visible=board.exists&&value?.classId===poll.classId&&value?.status!=='archived'&&(!value?.revealMode||value?.revealed);
  return new Map(poll.candidates.map((candidate:Data,index:number)=>[candidate.id,visible&&posts[index].exists&&posts[index].data()?.status==='published'&&!posts[index].data()?.deleted]));
}
async function pollView(ctx:Context,doc:FirebaseFirestore.DocumentSnapshot){const poll=mapped(doc),canManage=ctx.role!=='student'&&poll.ownerUid===ctx.uid,isClosed=closed(poll),results=canManage||poll.showResults==='live'||isClosed;const visible=await availability(poll);const own=ctx.role==='student'?await doc.ref.collection('votes').doc(hash(ctx.uid)).get():null;
  return{id:doc.id,classId:poll.classId,title:poll.title,status:isClosed?'closed':'open',closesAt:poll.closesAt,showResults:poll.showResults,hideNames:poll.hideNames,sourceKind:poll.sourceKind,canManage,createdAt:poll.createdAt,...(results?{totalVotes:poll.totalVotes||0}:{}),...(own?.exists?{ownVote:own.data()?.candidateId}:{}),candidates:await Promise.all(poll.candidates.map(async(candidate:Data,index:number)=>{const available=visible.get(candidate.id)===true;return{id:candidate.id,version:canManage?candidate.version:'1',title:!available?'공개가 중지된 자료':poll.sourceKind!=='manual'&&poll.hideNames&&!canManage?`작품 ${index+1}`:candidate.title,body:available?candidate.body:'',authorName:available&&(!poll.hideNames||canManage)?candidate.authorName:'',attachments:available?await attachmentViews(candidate.attachments,poll.hideNames&&!canManage?`작품 ${index+1} 자료`:undefined):[],available,...(results?{count:poll.counts?.[candidate.id]||0}:{})};}))};}
async function polls(ctx:Context,request:Request){
  if(request.method==='GET'){const classId=ctx.role==='student'?ctx.classId!:id(new URL(request.url).searchParams.get('classId'));await classAccess(ctx,classId);const docs=await db().collection('classPolls').where('classId','==',classId).limit(100).get();return json({polls:docs.docs.map(mapped).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(poll=>({id:poll.id,title:poll.title,status:closed(poll)?'closed':'open',createdAt:poll.createdAt,candidateCount:poll.candidates.length}))});}
  const value=await input(request),classId=id(value.classId);await managed(ctx,classId);const title=text(value.title,'투표 제목',160),kind=value.sourceKind;
  if(!['manual','assignment','board'].includes(kind)||!['live','closed'].includes(value.showResults)||typeof value.hideNames!=='boolean')throw new ApiError(400,'투표 설정을 확인해 주세요.');
  const ref=db().collection('classPolls').doc(hash(`${ctx.uid}:${id(value.requestId)}`)),fingerprint=hash(JSON.stringify(value));const existing=await ref.get();if(existing.exists){if(existing.data()?.creationFingerprint!==fingerprint)throw new ApiError(409,'요청 내용이 변경됐어요. 새 투표를 열어 주세요.','REQUEST_CONFLICT');return json({poll:await pollView(ctx,existing)},201);}
  let options:Data[]=[];
  if(kind==='manual'){if(!Array.isArray(value.options)||value.options.length<2||value.options.length>50)throw new ApiError(400,'투표 항목은 2~50개를 입력해 주세요.');options=value.options.map((option:unknown)=>({id:randomUUID(),version:'1',title:text(option,'투표 항목',200),body:'',authorName:'',attachments:[]}));}
  else{if(!Array.isArray(value.selected)||value.selected.length<2||value.selected.length>50)throw new ApiError(400,'자료를 2~50개 골라 주세요.');const candidates=await sourceCandidates(ctx,kind,id(value.sourceId),classId);const ids=new Set<string>();options=value.selected.map((selected:Data)=>{const source=candidates.find(candidate=>candidate.id===selected.id&&candidate.version===selected.version);if(!source||ids.has(source.id))throw new ApiError(409,'선택한 자료가 변경되었거나 중복됐어요. 새로 불러와 주세요.','SOURCE_CHANGED');ids.add(source.id);return{...source,id:hash(`${source.id}:${source.version}`),body:source.body.slice(0,1000),attachments:source.attachments.slice(0,3)};});}
  const closesAt=value.closesAt?new Date(value.closesAt).toISOString():null;if(closesAt&&Date.parse(closesAt)<=Date.now())throw new ApiError(400,'미래의 마감 시간을 골라 주세요.');
  const poll={classId,ownerUid:ctx.uid,title,sourceKind:kind,sourceId:kind==='manual'?'':id(value.sourceId),candidates:options,hideNames:value.hideNames,showResults:value.showResults,closesAt,status:'open',counts:{},totalVotes:0,createdAt:now(),creationFingerprint:fingerprint};await db().runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){if(old.data()?.creationFingerprint!==fingerprint)throw new ApiError(409,'다른 투표가 생성됐어요.','REQUEST_CONFLICT');return;}tx.create(ref,poll);});return json({poll:await pollView(ctx,await ref.get())},201);
}
async function vote(ctx:Context,request:Request,pollId:string){if(ctx.role!=='student')throw new ApiError(403,'학생 화면에서 투표해 주세요.');const doc=await pollAccess(ctx,pollId),value=await input(request),candidateId=id(value.candidateId);
  await db().runTransaction(async tx=>{const voteRef=doc.ref.collection('votes').doc(hash(ctx.uid)),[fresh,own]=await Promise.all([tx.get(doc.ref),tx.get(voteRef)]),poll=fresh.data()!;
    if(poll.classId!==ctx.classId||closed(poll))throw new ApiError(409,'투표가 마감됐어요.','POLL_CLOSED');const candidate=poll.candidates.find((item:Data)=>item.id===candidateId);if(!candidate)throw new ApiError(400,'투표 항목을 확인해 주세요.');
    if(poll.sourceKind==='board'){const boardRef=db().doc(`participationBoards/${poll.sourceId}`),[board,post]=await Promise.all([tx.get(boardRef),tx.get(boardRef.collection('posts').doc(candidate.origin.postId))]);if(!board.exists||board.data()?.classId!==poll.classId||board.data()?.status==='archived'||(board.data()?.revealMode&&!board.data()?.revealed)||!post.exists||post.data()?.deleted||post.data()?.status!=='published')throw new ApiError(409,'공개가 중지된 자료에는 투표할 수 없어요.','SOURCE_HIDDEN');}
    if(own.exists&&own.data()?.candidateId===candidateId)return;const counts={...poll.counts};if(own.exists)counts[own.data()!.candidateId]=Math.max(0,(counts[own.data()!.candidateId]||0)-1);counts[candidateId]=(counts[candidateId]||0)+1;
    tx.update(doc.ref,{counts,totalVotes:(poll.totalVotes||0)+(own.exists?0:1),updatedAt:now()});tx.set(voteRef,{candidateId,studentId:ctx.studentId,updatedAt:now()});
  });return json({poll:await pollView(ctx,await doc.ref.get())});
}
export async function handleLearningLinks(request:Request,segments:string[]){try{
  if(!['GET','HEAD'].includes(request.method))assertOrigin(request);const ctx=await getContext(request),[section,key,action]=segments;
  if(section==='candidates'&&request.method==='GET')return await candidates(ctx,request);
  if(section==='publish'&&request.method==='POST')return await publish(ctx,request);
  if(section==='polls'&&!key&&['GET','POST'].includes(request.method))return await polls(ctx,request);
  if(section==='polls'&&key&&action==='vote'&&request.method==='POST')return await vote(ctx,request,key);
  if(section==='polls'&&key&&!action){const doc=await pollAccess(ctx,key);if(request.method==='GET')return json({poll:await pollView(ctx,doc)});if(request.method==='PATCH'){const value=await input(request);await managed(ctx,doc.data()!.classId);if(!['open','closed'].includes(value.status))throw new ApiError(400,'투표 상태를 확인해 주세요.');await doc.ref.update({status:value.status,...(value.status==='open'?{closesAt:null}:{}),updatedAt:now()});return json({poll:await pollView(ctx,await doc.ref.get())});}}
  throw new ApiError(404,'요청한 기능을 찾을 수 없어요.');
}catch(error){if(error instanceof ApiError)return json({error:error.message,code:error.code},error.status);if(error instanceof RangeError)return json({error:'날짜를 확인해 주세요.'},400);console.error('Learning link operation failed',(error as{code?:string}).code||'INTERNAL');return json({error:'자료를 연결하지 못했어요. 다시 시도해 주세요.'},500);}}
