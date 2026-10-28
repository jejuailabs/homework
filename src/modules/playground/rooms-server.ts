import 'server-only';
import {createHash, randomInt} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import type {Context} from '@/lib/server/auth';
import {ApiError, id} from '@/lib/server/policy';
import {addPointBalance, pointBalance, wardrobeOutfit} from '@/lib/server/points-policy';
import {companionProfile} from '@/modules/my-space/profile';
import {accessStudent, teacherClass, loadItems, settingsOf, settingsRef, requirePlayEnabled} from './server-access';
import {addDays, choicesFor, emptyScore, gradeBand, normalizeAnswer, playDate, schoolYear, weekStart} from './engine';
import {playKinds, type PlayItem, type PlayScore, type PlaySettings} from './types';
import {activeKeys, canAnswer, roomDue, roomTransition, roundResults, snakeTeams, teamScores} from './room-machine';
import type {PlayRoom, PlayRoomMode, RoomAnswer, RoomBootstrap, RoomPlayer, RoomPlayerSummary, PublicRoomRound} from './room-types';

type Data = Record<string, unknown>;
type RoomAction = 'start'|'tick'|'next'|'pause'|'end';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const refFor = (roomId: string) => db().collection('playRooms').doc(id(roomId));
const keyFor = (ctx: Context) => ctx.role === 'student' ? ctx.studentId! : `teacher_${ctx.uid}`;
const summary = ({key,name,character,imageSrc,outfit,spaceOutfit,team,score,lastSeen,forfeited,reaction}: RoomPlayer): RoomPlayerSummary => ({key,name,character,...(imageSrc?{imageSrc}:{}),outfit,spaceOutfit,team,score,lastSeen,forfeited,reaction});
const terminal = (room: PlayRoom) => room.status === 'finished' || room.status === 'closed';
const liveEnabled = () => process.env.PLAYGROUND_DISABLED !== 'true' && process.env.PLAYGROUND_LIVE_DISABLED !== 'true';
function bounded(value: unknown, fallback: number, min: number, max: number) {if (value === undefined) return fallback; if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new ApiError(400, `${min}~${max} 사이의 정수를 선택해 주세요.`); return Number(value);}
function allowedTime(settings: PlaySettings, now: number) {const time = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(now);return !settings.timeWindows.length || settings.timeWindows.some(window => window.start <= time && time < window.end);}
function playerFrom(ctx: Context, data: FirebaseFirestore.DocumentData, now: number, space?: FirebaseFirestore.DocumentData): RoomPlayer {
  const buddy=companionProfile(data,space),body=buddy?.outfit?.body,bag=buddy?.outfit?.bag;
  return {key:ctx.studentId!,uid:ctx.uid,name:String(data.name || '친구').slice(0,80),character:String(data.character || 'cat'),imageSrc:buddy?.art||'',outfit:wardrobeOutfit(data.wardrobeOutfit,data.wardrobeOwned),spaceOutfit:{...(typeof body==='string'?{body}:{}),...(typeof bag==='string'?{bag}:{})},team:0,score:0,lastSeen:now,forfeited:false,answered:0,eligibleFrom:0,joinedAt:now,lastReactionAt:0,reaction:'',answeredRound:-1};
}
function writeGrant(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, ctx: Context, classId: string, now: number) {
  tx.set(ref.collection('readerGrants').doc(ctx.uid), {role:ctx.role === 'student' ? 'student' : 'teacher',playerKey:keyFor(ctx),classId,authVersion:ctx.authVersion ?? -1,expiresAt:Timestamp.fromMillis(now + 60_000)});
}
async function roomAccess(ctx: Context, roomId: string, tx: FirebaseFirestore.Transaction) {
  const ref = refFor(roomId), snapshot = await tx.get(ref);
  if (!snapshot.exists) throw new ApiError(404, '방을 찾을 수 없어요.');
  const room = snapshot.data() as PlayRoom;
  if (room.expiresAtMs <= Date.now()) throw new ApiError(410, '이 방은 종료되었어요.');
  let settings: PlaySettings;
  if (ctx.role === 'student') {
    const access = await accessStudent(ctx, tx); settings = access.settings; requirePlayEnabled(access);
    if (ctx.classId !== room.classId || !room.playerKeys.includes(ctx.studentId!)) throw new ApiError(403, '참가한 우리 반 방만 볼 수 있어요.');
  } else {await teacherClass(ctx, room.classId, tx); settings = settingsOf((await tx.get(settingsRef(room.classId))).data());}
  const playerSnapshot = ctx.role === 'student' ? await tx.get(ref.collection('players').doc(ctx.studentId!)) : null;
  const player = playerSnapshot?.data() as RoomPlayer | undefined;
  if (ctx.role === 'student' && player?.uid !== ctx.uid) throw new ApiError(403, '학생 계정으로 다시 참가해 주세요.');
  return {ref, room, player, settings};
}
function roundPublic(item: PlayItem, round: number, roomId: string): PublicRoomRound {return {round,kind:item.kind,prompt:item.prompt,choices:choicesFor(item, `${roomId}:${round}`)};}
async function createRoom(ctx: Context, data: Data) {
  const now = Date.now(), mode = data.mode as PlayRoomMode;
  if (!['duel','speed','team'].includes(mode) || ctx.role === 'student' && mode === 'team' || ctx.role !== 'student' && mode !== 'team') throw new ApiError(400, '놀이 모드를 다시 선택해 주세요.');
  const classId = ctx.role === 'student' ? ctx.classId! : id(data.classId), requestId = id(data.requestId), ref = refFor(digest(`${ctx.uid}:${requestId}`));
  const kinds = Array.isArray(data.kinds) && data.kinds.length && data.kinds.every(kind => playKinds.includes(kind)) ? [...new Set(data.kinds)] as PlayRoom['kinds'] : [...playKinds];
  const rounds = mode === 'duel' ? 7 : mode === 'speed' ? 10 : bounded(data.rounds,10,3,30), seconds = mode === 'duel' ? 15 : mode === 'speed' ? 10 : bounded(data.seconds,15,10,30), teamCount = bounded(data.teamCount,2,2,6);
  // A class-scoped code is reserved in the same transaction as the room.
  for (let attempt=0; attempt<12; attempt++) {
    const code = String(randomInt(1000,10000)), codeRef = db().doc(`classes/${classId}/playRoomCodes/${code}`);
    const result = await db().runTransaction(async tx => {
      const student = ctx.role === 'student' ? await accessStudent(ctx,tx) : null;
      const cls = student?.cls || await teacherClass(ctx,classId,tx), settings = student?.settings || settingsOf((await tx.get(settingsRef(classId))).data());
      if (!settings.enabled || student && (!settings.allowDuels || !allowedTime(settings,now))) throw new ApiError(403, '지금은 친구 대결을 열 수 없어요. 선생님 설정을 확인해 주세요.');
      const [existing,reserved,limit] = await Promise.all([tx.get(ref),tx.get(codeRef),tx.get(db().doc(`classes/${classId}/playRoomLimits/${ctx.uid}`))]);
      if (existing.exists) {const old = existing.data() as PlayRoom; return {roomId:old.id,code:old.code};}
      if (reserved.exists && reserved.data()!.expiresAtMs > now) return null;
      const recent: number[] = (limit.data()?.created || []).filter((at: number)=>now-at<3600_000);
      if (recent.length>=10) throw new ApiError(429,'방은 한 시간에 10개까지 만들 수 있어요.');
      const activeId = limit.data()?.activeId;
      let expiredLobby: FirebaseFirestore.DocumentReference | null = null;
      if (activeId) {const active = (await tx.get(refFor(activeId))).data() as PlayRoom | undefined;if(active && !terminal(active) && active.expiresAtMs>now){if(active.status==='lobby'&&active.statusEndsAt<=now)expiredLobby=refFor(activeId);else throw new ApiError(409,'이미 만든 방을 마치고 새 방을 열어 주세요.');}}
      let items = (await loadItems(classId, student?.gradeBand || gradeBand(cls.data()?.grade),tx)).filter(item=>kinds.includes(item.kind)&&item.choices&&item.choices.length>=2);
      if (ctx.role === 'student' && data.itemIds !== undefined) throw new ApiError(400,'학생 방은 서버가 문제를 골라요.');
      if (Array.isArray(data.itemIds) && data.itemIds.length) {const selected = new Set(data.itemIds);items=items.filter(item=>selected.has(item.id));}
      if (data.range === 'week') {const list=await tx.get(cls.ref.collection('playgroundLists').doc(weekStart(playDate())));const selected=new Set(list.data()?.itemIds||[]);items=items.filter(item=>selected.has(item.id));}
      if (data.range === 'mistakes') {const pupils=await tx.get(cls.ref.collection('students')),counts=new Map<string,number>();for(const pupil of pupils.docs.filter(row=>!row.data().disabled)){const skills=await tx.get(pupil.ref.collection('playgroundYears').doc(String(schoolYear(playDate()))).collection('spelling'));for(const skill of skills.docs)counts.set(skill.id,(counts.get(skill.id)||0)+Number(skill.data().errors||0));}const top=new Set([...counts].filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([key])=>key));items=items.filter(item=>item.kind==='spelling'&&top.has(item.id));}
      if (items.length<rounds) throw new ApiError(409, `선택한 범위에 보기 문제가 ${rounds}개 이상 있어야 해요.`);
      items.sort((a,b)=>digest(`${ref.id}:${a.id}`).localeCompare(digest(`${ref.id}:${b.id}`)));
      const space = student ? await tx.get(student.pupil.ref.collection('mySpace').doc('room')) : null;
      const player = student ? playerFrom(ctx,student.pupil.data()!,now,space?.data()) : null;
      const room: PlayRoom = {id:ref.id,code,classId,ownerUid:cls.data()!.ownerUid,hostKey:keyFor(ctx),mode,status:'lobby',kinds,playerKeys:player?[player.key]:[],players:player?[summary(player)]:[],teams:[],teamCount,round:-1,roundsTotal:rounds,questionMs:seconds*1000,roundStartsAt:0,roundEndsAt:0,statusEndsAt:now+600_000,createdAt:now,updatedAt:now,expiresAtMs:now+3*3600_000,settled:false,pausedFrom:null,pausedAt:0,skippedRounds:[]};
      tx.create(ref,room);tx.set(codeRef,{roomId:ref.id,expiresAtMs:room.expiresAtMs});tx.set(limit.ref,{activeId:ref.id,created:[...recent,now]});
      if(expiredLobby)tx.update(expiredLobby,{status:'closed',expiresAtMs:now});
      items.slice(0,rounds).forEach((item,index)=>tx.create(ref.collection('secrets').doc(String(index)),{item}));
      if(player)tx.create(ref.collection('players').doc(player.key),player);
      writeGrant(tx,ref,ctx,classId,now);return {roomId:ref.id,code};
    });
    if(result)return result;
  }
  throw new ApiError(409,'방 코드를 준비하지 못했어요. 다시 시도해 주세요.');
}
export async function joinRoom(ctx: Context, code: unknown, expectedRoomId?: string, inviteId?: string) {
  if (typeof code !== 'string' || !/^\d{4}$/.test(code)) throw new ApiError(400,'숫자 4자리 방 코드를 입력해 주세요.');
  return db().runTransaction(async tx=>{
    const access = await accessStudent(ctx,tx);requirePlayEnabled(access);
    const reservation = await tx.get(db().doc(`classes/${ctx.classId}/playRoomCodes/${code}`));
    if(!reservation.exists || reservation.data()!.expiresAtMs<=Date.now())throw new ApiError(404,'우리 반의 열린 방 코드를 확인해 주세요.');
    const ref=refFor(reservation.data()!.roomId), snapshot=await tx.get(ref),room=snapshot.data() as PlayRoom|undefined,now=Date.now();
    if(expectedRoomId && room?.id!==expectedRoomId)throw new ApiError(409,'이 초대의 방은 닫혔어요. 새 초대를 받아 주세요.');
    if(!room || room.classId!==ctx.classId || room.expiresAtMs<=now || room.status==='closed')throw new ApiError(404,'방을 찾을 수 없어요.');
    if(room.status==='lobby'&&room.statusEndsAt<=now)throw new ApiError(410,'오래 기다린 방은 닫혔어요. 새 방을 열어 주세요.');
    const invite=inviteId?await tx.get(db().doc(`classes/${ctx.classId}/playInvites/${id(inviteId)}`)):null;
    if(invite && (!invite.exists||invite.data()!.to!==ctx.studentId||invite.data()!.roomId!==expectedRoomId||invite.data()!.code!==code||!['pending','accepted'].includes(invite.data()!.status)||invite.data()!.expiresAtMs<=now))throw new ApiError(409,'이 초대는 더 이상 사용할 수 없어요.');
    const old=await tx.get(ref.collection('players').doc(ctx.studentId!));
    if(old.exists){if(old.data()!.uid!==ctx.uid || old.data()!.forfeited)throw new ApiError(403,'이 판에서 나왔어요. 다음 판에 함께해 주세요.');if(invite)tx.update(invite.ref,{status:'accepted'});writeGrant(tx,ref,ctx,room.classId,now);return {roomId:room.id,code:room.code};}
    if(room.status!=='lobby' || room.playerKeys.length>=(room.mode==='duel'?2:room.mode==='speed'?4:40))throw new ApiError(409,'이미 시작했거나 자리가 모두 찼어요.');
    if(room.mode!=='team'&&!access.settings.allowDuels)throw new ApiError(403,'지금은 친구 대결을 이용할 수 없어요.');
    const space=await tx.get(access.pupil.ref.collection('mySpace').doc('room'));
    const player=playerFrom(ctx,access.pupil.data()!,now,space.data());player.team=room.playerKeys.length%room.teamCount;
    room.playerKeys.push(player.key);room.players.push(summary(player));room.updatedAt=now;
    tx.create(old.ref,player);tx.set(ref,room);if(invite)tx.update(invite.ref,{status:'accepted'});writeGrant(tx,ref,ctx,room.classId,now);return {roomId:room.id,code:room.code};
  }, {maxAttempts:20});
}
async function bootstrap(ctx: Context, roomId: string): Promise<RoomBootstrap> {
  return db().runTransaction(async tx=>{
    const {ref,room,player}=await roomAccess(ctx,roomId,tx), now=Date.now();
    const question=room.round<0?null:(await tx.get(ref.collection('rounds').doc(String(room.round)))).data() as PublicRoomRound|undefined;
    const roster=ctx.role!=='student'?(await tx.get(ref.collection('players'))).docs.map(doc=>doc.data() as RoomPlayer):undefined;
    if(player&&!player.forfeited&&!terminal(room)){if(now-player.lastSeen>30000&&room.status!=='lobby')player.eligibleFrom=room.round+1;player.lastSeen=now;tx.set(ref.collection('players').doc(player.key),player);}
    writeGrant(tx,ref,ctx,room.classId,now);
    return {room,question:question||null,player:player||null,...(roster?{players:roster}:{}),viewer:{uid:ctx.uid,key:keyFor(ctx),teacher:ctx.role!=='student',canHost:ctx.role!=='student'||room.hostKey===keyFor(ctx)},serverTime:now};
  });
}
async function heartbeat(ctx: Context, roomId: string) {
  return db().runTransaction(async tx=>{
    const {ref,room,player}=await roomAccess(ctx,roomId,tx),now=Date.now();
    if(player && !player.forfeited){if(now-player.lastSeen>30000 && room.status!=='lobby')player.eligibleFrom=room.round+1;player.lastSeen=now;tx.set(ref.collection('players').doc(player.key),player);if(room.status==='lobby'&&room.mode!=='team')tx.update(ref,{players:room.players.map(member=>member.key===player.key?summary(player):member)});}
    writeGrant(tx,ref,ctx,room.classId,now);return {serverTime:now,player:player||null};
  });
}
async function submitAnswer(ctx: Context, roomId: string, data: Data) {
  const receivedAt=Date.now(), round=bounded(data.round,-1,0,29),choiceId=id(data.choiceId ?? data.choice);
  const result=await db().runTransaction(async tx=>{
    const {ref,room,player}=await roomAccess(ctx,roomId,tx);
    if(!player)throw new ApiError(403,'참가 학생만 답할 수 있어요.');
    const answerRef=ref.collection('answers').doc(`${round}_${player.key}`),existing=await tx.get(answerRef);
    if(existing.exists)return {accepted:true,serverTime:receivedAt,mode:room.mode};
    if(round!==room.round || !canAnswer(room,player,receivedAt))throw new ApiError(409,'이 문제의 답안 시간이 끝났어요. 다음 문제에 참여해 주세요.');
    const secret=(await tx.get(ref.collection('secrets').doc(String(round)))).data()?.item as PlayItem|undefined;
    if(!secret)throw new ApiError(409,'문제를 다시 불러와 주세요.');
    const selected=choicesFor(secret,`${room.id}:${round}`).find(choice=>choice.id===choiceId);
    if(!selected)throw new ApiError(400,'화면에 나온 보기 중에서 골라 주세요.');
    const correct=secret.answers.some(answer=>normalizeAnswer(answer,secret.kind)===normalizeAnswer(selected.label,secret.kind));
    tx.create(answerRef,{key:player.key,round,choiceId,receivedAt,elapsedMs:Math.max(0,receivedAt-room.roundStartsAt),correct} satisfies RoomAnswer);
    tx.update(ref.collection('players').doc(player.key),{answered:player.answered+1,answeredRound:round,lastSeen:receivedAt});
    return {accepted:true,serverTime:receivedAt,mode:room.mode};
  });
  // Up to four players: reveal as soon as every connected player answered. The teacher screen does this for team rooms.
  if(result.mode!=='team')await step(roomId,'tick',{}).catch(error=>console.error('Playground early reveal failed',(error as {code?: string}).code||'INTERNAL'));
  return {accepted:result.accepted,serverTime:result.serverTime};
}
async function advance(ctx: Context, roomId: string, action: RoomAction, data: Data) {
  await step(roomId,action,data,ctx);
  return bootstrap(ctx,roomId);
}
/** Without ctx this is the server's own timer tick: it can only apply transitions whose time has come. */
async function step(roomId: string, action: RoomAction, data: Data, ctx?: Context) {
  const now=Date.now();
  await db().runTransaction(async tx=>{
    let ref=refFor(roomId),room:PlayRoom;
    if(ctx){
      ({ref,room}=await roomAccess(ctx,roomId,tx));
      if(action!=='tick' && ctx.role==='student' && (room.hostKey!==keyFor(ctx)||!['start','end'].includes(action)))throw new ApiError(403,'방장이나 선생님이 진행할 수 있어요.');
      if(action==='tick' && room.mode==='team' && ctx.role==='student')throw new ApiError(403,'팀전은 선생님이 진행해요.');
    } else {
      const snapshot=await tx.get(ref);
      if(!snapshot.exists||action!=='tick')return;
      room=snapshot.data() as PlayRoom;
    }
    // A delayed button request cannot advance or pause a newer phase.
    if(data.status!==undefined&&data.status!==room.status || data.round!==undefined&&data.round!==room.round)return;
    const playerDocs=await tx.get(ref.collection('players')),players=playerDocs.docs.map(doc=>doc.data() as RoomPlayer).filter(player=>room.playerKeys.includes(player.key));
    const answerDocs=room.round>=0?await tx.get(ref.collection('answers').where('round','==',room.round)):null;
    const answers=answerDocs?.docs.map(doc=>doc.data() as RoomAnswer)||[];
    const active=activeKeys(room,players,now);
    const next=roomTransition(room,action,now,answers.filter(answer=>active.has(answer.key)).length,active.size);
    if(next.status===room.status && next.round===room.round)return;
    if(action==='start' && next.status==='countdown') {
      // A 1:1 needs both friends. Larger rooms start without a closed laptop; that player joins from the next question on reconnecting.
      const offline=players.filter(player=>player.forfeited||now-player.lastSeen>30000);
      if(room.mode==='duel'&&offline.length)throw new ApiError(409,'두 친구가 모두 연결된 뒤 시작해 주세요.');
      if(players.length-offline.length<2)throw new ApiError(409,'연결된 친구가 두 명 이상일 때 시작할 수 있어요.');
      if(room.mode==='team') {
        const weeks=Array.from({length:4},(_,i)=>weekStart(addDays(playDate(),-7*i))),previous=await Promise.all(players.map(player=>Promise.all(weeks.map(week=>tx.get(db().doc(`classes/${room.classId}/students/${player.key}/playgroundScores/${week}`))))));
        const teams=snakeTeams(players.map((player,i)=>({key:player.key,previousScore:previous[i].reduce((sum,row)=>sum+(row.data()?.solo||0),0)})),Math.min(room.teamCount,players.length));
        const manual=data.teams&&typeof data.teams==='object'?data.teams as Record<string,unknown>:{};
        players.forEach(player=>{player.team=manual[player.key]===undefined?teams[player.key]:bounded(manual[player.key],0,0,room.teamCount-1);});
        if(new Set(players.map(player=>player.team)).size<2)throw new ApiError(400,'두 팀 이상으로 나누어 주세요.');
        next.teams=teamScores(players,room.teamCount);next.players=players.map(summary);
      }
    }
    const secret=next.status==='question'||next.status==='reveal'?(await tx.get(ref.collection('secrets').doc(String(next.round)))).data()?.item as PlayItem|undefined:null;
    if((next.status==='question'||next.status==='reveal')&&!secret)throw new ApiError(409,'다음 문제를 찾을 수 없어요.');
    if(next.status==='reveal'&&room.status==='question'&&secret){
      const results=roundResults(next,answers),question=roundPublic(secret,next.round,next.id);
      const correctChoice=question.choices.find(choice=>secret.answers.some(answer=>normalizeAnswer(answer,secret.kind)===normalizeAnswer(choice.label,secret.kind)));
      players.forEach(player=>{player.score+=results.find(result=>result.key===player.key)?.points||0;});
      question.correctChoiceId=correctChoice?.id||'';question.reveal=secret.reveal;question.results=results;question.distribution=Object.fromEntries(question.choices.map(choice=>[choice.id,answers.filter(answer=>answer.choiceId===choice.id).length]));question.skipped=next.skippedRounds.includes(next.round);
      next.players=players.map(summary);next.teams=next.mode==='team'?teamScores(players,next.teamCount):[];
      tx.set(ref.collection('rounds').doc(String(next.round)),question);
    }else if(next.status==='question'&&room.status!=='paused'&&secret)tx.set(ref.collection('rounds').doc(String(next.round)),roundPublic(secret,next.round,next.id));
    if(next.status==='reveal'&&room.status==='question'||action==='start')players.forEach(player=>tx.set(ref.collection('players').doc(player.key),player));
    tx.set(ref,next);
  });
  await settleRoom(roomId);
}
/** Lean polling read for screens whose realtime listener is unavailable. Re-sends the round only when it changed. */
async function roomState(ctx: Context, roomId: string, known: string | null) {
  const ref=refFor(roomId);
  let room=(await ref.get()).data() as PlayRoom|undefined;
  if(!room||room.expiresAtMs<=Date.now())throw new ApiError(410,'이 방은 종료되었어요.');
  if(ctx.role==='student'){if(ctx.classId!==room.classId||!room.playerKeys.includes(ctx.studentId!))throw new ApiError(403,'참가한 우리 반 방만 볼 수 있어요.');}
  else if(room.ownerUid!==ctx.uid)await teacherClass(ctx,room.classId);
  if(roomDue(room,Date.now())){await step(roomId,'tick',{});room=(await ref.get()).data() as PlayRoom;}
  const key=`${room.status}:${room.round}`;
  const [round,players]=await Promise.all([
    room.round>=0&&known!==key?ref.collection('rounds').doc(String(room.round)).get():null,
    ctx.role!=='student'&&['lobby','question','paused'].includes(room.status)?ref.collection('players').get():null,
  ]);
  return {room,key,...(round?{question:(round.data() as PublicRoomRound|undefined)||null}:{}),...(players?{players:players.docs.map(doc=>doc.data() as RoomPlayer)}:{}),serverTime:Date.now()};
}
async function settleRoom(roomId: string) {
  await db().runTransaction(async tx=>{
    const ref=refFor(roomId),snapshot=await tx.get(ref),room=snapshot.data() as PlayRoom|undefined;
    if(!room||room.status!=='finished'||room.settled)return;
    const now=Date.now(),date=playDate(),week=weekStart(date),settings=settingsOf((await tx.get(settingsRef(room.classId))).data());
    const players=(await tx.get(ref.collection('players'))).docs.map(doc=>doc.data() as RoomPlayer).filter(player=>room.playerKeys.includes(player.key));
    if(room.mode==='duel')players.forEach(player=>{if(now-player.lastSeen>30000)player.forfeited=true;});
    const pairs=room.mode==='team'?[]:players.flatMap((player,i)=>players.slice(i+1).map(other=>({id:digest([date,...[player.key,other.key].sort()].join(':')),keys:[player.key,other.key]})));
    const pairDocs=await Promise.all(pairs.map(pair=>tx.get(db().doc(`classes/${room.classId}/playPairDays/${pair.id}`))));
    const states=await Promise.all(players.map(async player=>{
      const pupilRef=db().doc(`classes/${room.classId}/students/${player.key}`),dayRef=pupilRef.collection('playgroundYears').doc(String(schoolYear(date))).collection('days').doc(date),scoreRef=pupilRef.collection('playgroundScores').doc(week),receiptRef=pupilRef.collection('pointLedger').doc(`playground_room_${roomId}`);
      const [pupil,day,score,receipt]=await Promise.all([tx.get(pupilRef),tx.get(dayRef),tx.get(scoreRef),tx.get(receiptRef)]);return {player,pupil,day,score,receipt};
    }));
    const eligible=players.filter(player=>!player.forfeited),maxScore=Math.max(0,...eligible.map(player=>player.score));
    for(const {player,pupil,day,score,receipt} of states){
      if(!pupil.exists||pupil.data()?.disabled||pupil.data()?.authUid!==player.uid)continue;
      const record={...emptyScore(),...score.data()} as PlayScore;
      const completed=room.completion==='complete'||room.completion==='forfeit';
      const ranked=completed && room.mode!=='team' && pairs.every((pair,index)=>!pair.keys.includes(player.key)||(pairDocs[index].data()?.count||0)<3);
      const won=!player.forfeited&&player.score===maxScore,draw=won&&eligible.filter(other=>other.score===maxScore).length>1;
      if(ranked){if(draw)record.draws++;else if(won)record.wins++;else record.losses++;}
      if(completed){record.games++;record.days=[...new Set([...record.days,date])];}
      const complete=room.completion==='complete'&&!player.forfeited&&player.answered>=room.roundsTotal-room.skippedRounds.length&&room.round+1>=room.roundsTotal;
      const paid=Number(day.data()?.duelRewardPaid||0),amount=room.mode!=='team'&&complete&&settings.rewardsEnabled&&!receipt.exists?Math.min(settings.duelReward,Math.max(0,3-paid)):0;
      tx.set(score.ref,record,{merge:true});tx.set(day.ref,{duelGames:Number(day.data()?.duelGames||0)+(completed?1:0),duelRewardPaid:paid+amount},{merge:true});
      if(amount){const balance=addPointBalance(pointBalance(pupil.data()?.points),amount);tx.update(pupil.ref,{points:balance,pointsEarnedTotal:addPointBalance(pointBalance(pupil.data()?.pointsEarnedTotal),amount)});tx.create(receipt.ref,{amount,kind:'earn',source:'playground',sourceId:roomId,reason:'말놀이터 대결 참여',balanceAfter:balance,createdAt:new Date(now).toISOString(),classId:room.classId,studentId:player.key,actorUid:player.uid});}
    }
    if(room.completion==='complete'||room.completion==='forfeit')pairs.forEach((pair,index)=>tx.set(pairDocs[index].ref,{count:Number(pairDocs[index].data()?.count||0)+1,date,keys:pair.keys}));
    tx.update(ref,{settled:true,players:players.map(summary),expiresAtMs:now+1800_000});
  });
}
async function leaveOrReact(ctx: Context, roomId: string, data: Data, leave: boolean) {
  const result=await db().runTransaction(async tx=>{
    const {ref,room,player}=await roomAccess(ctx,roomId,tx),now=Date.now();
    if(!player)throw new ApiError(403,'참가 학생만 사용할 수 있어요.');
    if(terminal(room))return {ok:true};
    if(leave){player.forfeited=true;player.lastSeen=0;if(room.status==='lobby'){room.playerKeys=room.playerKeys.filter(key=>key!==player.key);room.players=room.players.filter(p=>p.key!==player.key);if(room.hostKey===player.key){room.status='closed';room.expiresAtMs=now+60000;}tx.set(ref,room);}else if(room.mode==='duel'&&!terminal(room)){room.status='finished';room.completion=room.round<0?'cancelled':'forfeit';room.statusEndsAt=0;room.expiresAtMs=now+1800000;tx.set(ref,room);}tx.set(ref.collection('players').doc(player.key),player);tx.delete(ref.collection('readerGrants').doc(ctx.uid));}
    else {if(!['👍','😮','😂','🔥'].includes(String(data.emoji)))throw new ApiError(400,'반응을 골라 주세요.');if(now-player.lastReactionAt<2000)throw new ApiError(429,'반응은 2초에 한 번 보내요.');player.reaction=String(data.emoji);player.lastReactionAt=now;tx.set(ref.collection('players').doc(player.key),player);}
    return {ok:true};
  });
  if(leave)await settleRoom(roomId);return result;
}
async function rewardTeam(ctx: Context, roomId: string, data: Data) {
  const amount=bounded(data.amount,0,0,1000);
  return db().runTransaction(async tx=>{
    const {ref,room,settings}=await roomAccess(ctx,roomId,tx);if(ctx.role==='student'||room.mode!=='team'||room.status!=='finished')throw new ApiError(403,'팀전을 마친 선생님이 지급할 수 있어요.');
    if(!settings.rewardsEnabled)throw new ApiError(403,'설정에서 보말 연결을 먼저 켜 주세요.');
    const receipt=await tx.get(ref.collection('settlements').doc('teacher-reward'));
    if(receipt.exists){if(receipt.data()!.amount!==amount)throw new ApiError(409,'이 판의 보말은 이미 지급했어요.');return {ok:true};}
    const players=(await tx.get(ref.collection('players'))).docs.map(doc=>doc.data() as RoomPlayer).filter(player=>room.playerKeys.includes(player.key)&&!player.forfeited&&player.answered>0);
    const pupils=await Promise.all(players.map(player=>tx.get(db().doc(`classes/${room.classId}/students/${player.key}`))));
    pupils.forEach((pupil,index)=>{if(!pupil.exists||pupil.data()?.disabled||pupil.data()?.authUid!==players[index].uid)return;const balance=addPointBalance(pointBalance(pupil.data()?.points),amount);if(amount){tx.update(pupil.ref,{points:balance,pointsEarnedTotal:addPointBalance(pointBalance(pupil.data()?.pointsEarnedTotal),amount)});tx.create(pupil.ref.collection('pointLedger').doc(`playground_team_${roomId}`),{amount,kind:'earn',source:'playground',sourceId:roomId,reason:'말놀이터 팀전 참여',balanceAfter:balance,createdAt:new Date().toISOString(),classId:room.classId,studentId:pupil.id,actorUid:ctx.uid});}});
    tx.create(receipt.ref,{amount,actorUid:ctx.uid,at:Date.now()});return {ok:true};
  });
}
export async function handleRoomRequest(request: Request, ctx: Context, segments: string[], data: Data = {}) {
  if(segments[0]!=='rooms')return undefined;
  if(!liveEnabled())throw new ApiError(404,'실시간 말놀이터는 준비 중이에요.');
  if(request.method==='POST'&&segments.length===1)return createRoom(ctx,data);
  if(request.method==='POST'&&segments.length===2&&segments[1]==='join')return joinRoom(ctx,data.code);
  if(segments.length===2&&request.method==='GET')return bootstrap(ctx,id(segments[1]));
  if(segments.length===3&&segments[2]==='state'&&request.method==='GET'){const known=new URL(request.url).searchParams.get('known');return roomState(ctx,id(segments[1]),known&&known.length<=40?known:null);}
  if(segments.length===3&&request.method==='POST'){
    const roomId=id(segments[1]),action=segments[2];
    if(action==='heartbeat')return heartbeat(ctx,roomId);
    if(action==='answer')return submitAnswer(ctx,roomId,data);
    if(['start','tick','next','pause','end'].includes(action))return advance(ctx,roomId,action as RoomAction,data);
    if(action==='leave'||action==='react')return leaveOrReact(ctx,roomId,data,action==='leave');
    if(action==='reward')return rewardTeam(ctx,roomId,data);
  }
  throw new ApiError(404,'요청한 방 기능을 찾을 수 없어요.');
}
/** Explicit bounded recursive cleanup: deleting the parent alone leaves private answer documents behind. */
export async function cleanupPlayRooms() {
  if(!liveEnabled())return {deleted:0};
  const expired=await db().collection('playRooms').where('expiresAtMs','<=',Date.now()).limit(20).get();
  let deleted=0;
  for(const snapshot of expired.docs){
    const room=snapshot.data() as PlayRoom;
    if(room.status==='finished'&&!room.settled){await settleRoom(room.id);continue;}
    // Keep the parent discoverable until every child is gone, including across interrupted cleanups.
    await snapshot.ref.update({status:'closed'});
    for(const name of ['rounds','secrets','answers','players','readerGrants','settlements']){
      for(;;){const children=await snapshot.ref.collection(name).limit(200).get();if(children.empty)break;const batch=db().batch();children.docs.forEach(child=>batch.delete(child.ref));await batch.commit();}
    }
    await db().runTransaction(async tx=>{
      const code=await tx.get(db().doc(`classes/${room.classId}/playRoomCodes/${room.code}`));
      const limits=await tx.get(db().collection(`classes/${room.classId}/playRoomLimits`).where('activeId','==',room.id));
      if(code.data()?.roomId===room.id)tx.delete(code.ref);
      limits.docs.forEach(limit=>tx.set(limit.ref,{activeId:'',created:(limit.data().created||[]).filter((at:number)=>Date.now()-at<3600_000)}));
      tx.delete(snapshot.ref);
    });deleted++;
  }
  return {deleted};
}
