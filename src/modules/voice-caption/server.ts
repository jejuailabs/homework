import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { bucket, db } from '@/lib/server/admin';
import { ApiError, id, text } from '@/lib/server/policy';
import type { ModuleTarget } from '../artwork-extensions/server-contract';
import { boundedBytes, consumeModuleRate, digest, moduleJson } from '../artwork-extensions/server-utils';
import { VOICE_MAX_BYTES, wavDuration } from './wav';
import { transcribeVoice } from './provider';
type Data = Record<string, any>;
export async function voiceCaption(request: Request, t: ModuleTarget, segments: string[]): Promise<object | Response> {
    if (!t.options.voice.enabled || t.publicView && !t.options.voice.publicAudio)
        throw new ApiError(404, '음성 도슨트가 꺼져 있어요.', 'MODULE_DISABLED');
    const root = db().doc('moduleVoices/' + t.key), records = root.collection('recordings'), quota = db().doc('moduleVoiceStorage/' + t.ownerUid), recordId = segments[0] ? id(segments[0]) : '', ref = recordId ? records.doc(recordId) : null;
    const canEdit = (v: Data) => t.manage || t.record && v.actorKey === t.actor.key;
    const canTranscribe = t.manage && process.env.VOICE_AI_TRANSCRIPTION_ENABLED === 'true';
    const audioPath = (v: Data) => `module-voice/${t.ownerUid}/${t.key}/${v.id}.wav`;
    const view = (v: Data) => ({ id: v.id, caption: v.caption || '', duration: v.duration, status: v.status, transcription: v.transcription === 'running' && v.leaseUntil <= Date.now() ? 'failed' : v.transcription || 'idle', uploadStatus: v.uploadStatus, version: v.version, error: v.error || '', audioUrl: new URL(request.url).pathname.replace(/\/voice(?:\/.*)?$/, '/voice/' + v.id + '/audio') + new URL(request.url).search });
    if (request.method === 'GET') {
        const state = (await root.get()).data() || {};
        if (recordId) {
            const snapshot = await ref!.get(), v = snapshot.data();
            if (!v || v.uploadStatus !== 'ready' || !(v.status === 'approved' && state.activeId === recordId || canEdit(v) && v.uploadStatus !== 'deleted'))
                throw new ApiError(404, '음성을 찾을 수 없어요.');
            const [bytes] = await bucket().file(audioPath(v)).download();
            let start = 0, end = bytes.length - 1, status = 200;
            const range = request.headers.get('range');
            if (range) {
                const match = /^bytes=(\d+)-(\d*)$/.exec(range);
                if (!match)
                    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
                start = Number(match[1]);
                end = match[2] ? Math.min(Number(match[2]), end) : end;
                if (start > end || start >= bytes.length)
                    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
                status = 206;
            }
            return new Response(Uint8Array.from(bytes.subarray(start, end + 1)), { status, headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private,no-store', ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
        }
        const snapshots = await Promise.all((state.recordIds || []).map((key: string) => records.doc(key).get()));
        const all = snapshots.filter((d: any) => d.exists).map((d: any) => d.data() as Data), active = all.find((v: Data) => v.id === state.activeId && v.status === 'approved'), draft = all.find((v: Data) => v.id === state.draftId && canEdit(v) && v.uploadStatus !== 'deleted');
        return { active: active ? view(active) : null, draft: draft ? view(draft) : null, history: all.filter((v: Data) => canEdit(v) && v.id !== state.activeId && v.id !== state.draftId && v.uploadStatus !== 'deleted').map(view), viewer: { manage: t.manage, record: t.record, transcribe: canTranscribe }, publicAudio: t.options.voice.publicAudio };
    }
    if (!ref)
        throw new ApiError(400, '녹음 번호를 확인해 주세요.');
    if (request.method === 'POST' && !segments[1]) {
        if (!t.record || !t.actor.uid)
            throw new ApiError(403, '내 작품에 음성을 남겨 주세요.');
        const bytes = await boundedBytes(request, VOICE_MAX_BYTES);
        let duration: number;
        try {
            duration = wavDuration(bytes);
        }
        catch {
            throw new ApiError(400, '60초 이내 음성을 다시 녹음해 주세요.', 'AUDIO_INVALID');
        }
        const fingerprint = digest(bytes);
        await consumeModuleRate([{ key: 'voice-upload:' + t.actor.key, limit: 20, windowMs: 86400000 }]);
        const already = await db().runTransaction(async (tx) => {
            await t.assertFresh(tx, 'record');
            const [old, state, usage] = await Promise.all([tx.get(ref), tx.get(root), tx.get(quota)]);
            if (old.exists) {
                const v = old.data()!;
                if (v.fingerprint !== fingerprint || v.actorKey !== t.actor.key || ['deleting', 'deleted'].includes(v.uploadStatus))
                    throw new ApiError(409, '새 녹음으로 다시 시도해 주세요.');
                if (v.uploadStatus === 'uploading')
                    tx.update(ref, { uploadLeaseUntil: Date.now() + 90000 });
                return v.uploadStatus === 'ready';
            }
            const s = state.data() || {}, q = usage.data() || {}, limit = Number(process.env.VOICE_STORAGE_LIMIT_BYTES) || 104857600;
            if (s.draftId)
                throw new ApiError(409, '기존 녹음 초안을 먼저 저장·공개하거나 삭제해 주세요.');
            if ((s.recordIds || []).length >= 10)
                throw new ApiError(409, '이전 녹음 일부를 삭제한 뒤 다시 녹음해 주세요.');
            if ((q.usedBytes || 0) + (q.reservedBytes || 0) + bytes.length > limit)
                throw new ApiError(413, '음성 저장 공간이 가득 찼어요.');
            tx.set(quota, { usedBytes: q.usedBytes || 0, reservedBytes: (q.reservedBytes || 0) + bytes.length });
            tx.set(ref, { id: recordId, ownerUid: t.ownerUid, classId: t.classId, actorKey: t.actor.key, fingerprint, duration, size: bytes.length, uploadStatus: 'uploading', uploadLeaseUntil: Date.now() + 90000, quotaBucket: 'reservedBytes', status: 'draft', caption: '', transcription: 'idle', createdAt: new Date().toISOString(), version: crypto.randomUUID() });
            tx.set(root, { ownerUid: t.ownerUid, classId: t.classId, containerKey: t.containerKey, targetId: t.targetId, title: t.title, draftId: recordId, recordIds: FieldValue.arrayUnion(recordId) }, { merge: true });
            return false;
        });
        if (!already) {
            const file = bucket().file(audioPath({ id: recordId }));
            try {
                await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'audio/wav', cacheControl: 'private,no-store', metadata: { fingerprint } } });
            }
            catch (e) {
                if (Number((e as {
                    code?: number;
                }).code) !== 412)
                    throw e;
                const [metadata] = await file.getMetadata();
                if (metadata.metadata?.fingerprint !== fingerprint)
                    throw new ApiError(409, '녹음 파일이 달라요.');
            }
            await db().runTransaction(async (tx) => { await t.assertFresh(tx, 'record'); const [current, usage] = await Promise.all([tx.get(ref), tx.get(quota)]); const v = current.data()!; if (v.uploadStatus === 'ready')
                return; if (v.uploadStatus !== 'uploading')
                throw new ApiError(409, '녹음 상태가 바뀌었어요.'); tx.update(ref, { uploadStatus: 'ready', uploadLeaseUntil: 0, quotaBucket: 'usedBytes' }); tx.update(quota, { reservedBytes: (usage.data()?.reservedBytes || 0) - bytes.length, usedBytes: (usage.data()?.usedBytes || 0) + bytes.length }); });
        }
        return { recording: view((await ref.get()).data()!) };
    }
    // Audio storage and manual captions never implicitly enable a paid AI call.
    if (request.method === 'POST' && segments[1] === 'transcribe' && !canTranscribe)
        throw new ApiError(403, 'AI 자동 캡션은 별도 비용 승인 후 선생님만 사용할 수 있어요. 캡션을 직접 입력해 주세요.', 'VOICE_AI_DISABLED');
    const input = request.method === 'DELETE' ? {} : await moduleJson(request);
    if (request.method === 'POST' && segments[1] === 'transcribe') {
        const attempt = await db().runTransaction(async (tx) => { await t.assertFresh(tx, 'record'); const snapshot = await tx.get(ref), v = snapshot.data(); if (!v || !canEdit(v) || v.status !== 'draft' || v.uploadStatus !== 'ready')
            throw new ApiError(403, '내 녹음 초안만 변환할 수 있어요.'); if (v.transcription === 'done')
            return { cached: v.caption }; if (v.transcription === 'running' && v.leaseUntil > Date.now())
            throw new ApiError(409, '음성을 변환하고 있어요.'); if (['running', 'failed'].includes(v.transcription) && input.retry !== true)
            throw new ApiError(409, '변환 재시도 버튼을 눌러 주세요.', 'VOICE_RETRY_REQUIRED'); if ((v.attempt || 0) >= 3)
            throw new ApiError(429, '변환을 여러 번 시도했어요. 캡션을 직접 입력해 주세요.'); const token = crypto.randomUUID(); tx.update(ref, { transcription: 'running', leaseUntil: Date.now() + 90000, attempt: (v.attempt || 0) + 1, lease: token, error: '', version: token }); return { token,duration:v.duration }; });
        if ('cached' in attempt)
            return { caption: attempt.cached };
        try {
            const [audio] = await bucket().file(audioPath({ id: recordId })).download();
            const caption = await transcribeVoice(t.ownerUid, t.key + ':' + recordId + ':' + attempt.token, audio,{classId:t.classId,audioSeconds:attempt.duration});
            await db().runTransaction(async (tx) => { await t.assertFresh(tx, 'record'); const v = (await tx.get(ref)).data(); if (v?.lease !== attempt.token || v.uploadStatus !== 'ready' || v.status !== 'draft')
                throw new ApiError(409, '녹음이 변경됐어요.'); tx.update(ref, { caption, transcription: 'done', leaseUntil: 0, version: crypto.randomUUID() }); });
            return { caption };
        }
        catch (e) {
            await db().runTransaction(async (tx) => { const v = (await tx.get(ref)).data(); if (v?.lease === attempt.token && v.transcription === 'running')
                tx.update(ref, { transcription: 'failed', leaseUntil: 0, error: e instanceof ApiError ? e.code : 'VOICE_TRANSCRIPTION_FAILED', version: crypto.randomUUID() }); });
            throw e;
        }
    }
    if (request.method === 'PATCH') {
        await db().runTransaction(async (tx) => {
            await t.assertFresh(tx, input.status ? 'manage' : 'record');
            const [snapshot, state] = await Promise.all([tx.get(ref), tx.get(root)]), v = snapshot.data();
            if (!v || v.uploadStatus !== 'ready' || !canEdit(v))
                throw new ApiError(403, '이 녹음을 수정할 수 없어요.');
            if (v.transcription === 'running' && v.leaseUntil > Date.now())
                throw new ApiError(409, '변환이 끝난 뒤 수정해 주세요.');
            if (v.version !== input.version)
                throw new ApiError(409, '녹음이 바뀌었어요. 새로고침해 주세요.');
            const version = crypto.randomUUID();
            if (input.status) {
                if (!t.manage || !['approved', 'hidden'].includes(input.status))
                    throw new ApiError(403, '선생님이 공개를 승인해 주세요.');
                if (input.status === 'approved') {
                    const active = state.data()?.activeId, previous = active && active !== recordId ? await tx.get(records.doc(active)) : null;
                    if (!v.caption.trim())
                        throw new ApiError(400, '캡션을 먼저 입력해 주세요.');
                    if (previous?.exists)
                        tx.update(previous.ref, { status: 'hidden', version: crypto.randomUUID() });
                    tx.update(ref, { status: 'approved', version });
                    tx.set(root, { activeId: recordId, draftId: null }, { merge: true });
                }
                else {
                    tx.update(ref, { status: 'hidden', version });
                    tx.set(root, { ...(state.data()?.activeId === recordId ? { activeId: null } : {}), ...(state.data()?.draftId === recordId ? { draftId: null } : {}) }, { merge: true });
                }
            }
            else {
                if (v.status !== 'draft')
                    throw new ApiError(409, '새 녹음 초안에서 수정해 주세요.');
                tx.update(ref, { caption: text(input.caption, '캡션', 3000), version, transcription: 'done' });
            }
        });
        return { saved: true };
    }
    if (request.method === 'DELETE') {
        const value = await db().runTransaction(async (tx) => { await t.assertFresh(tx, t.manage ? 'manage' : 'record'); const v = (await tx.get(ref)).data(); if (!v || !canEdit(v))
            throw new ApiError(404, '녹음을 찾을 수 없어요.'); if (v.uploadStatus === 'deleted')
            return v; if (v.uploadStatus === 'uploading' && v.uploadLeaseUntil > Date.now())
            throw new ApiError(409, '음성 전송을 정리하고 있어요. 잠시 후 다시 삭제해 주세요.'); tx.update(ref, { uploadStatus: 'deleting', status: 'hidden', version: crypto.randomUUID() }); return v; });
        if (value.uploadStatus !== 'deleted') {
            await bucket().file(audioPath(value)).delete({ ignoreNotFound: true });
            await db().runTransaction(async (tx) => { const [current, usage, state] = await Promise.all([tx.get(ref), tx.get(quota), tx.get(root)]); if (current.data()?.uploadStatus === 'deleted')
                return; const field = value.quotaBucket || 'usedBytes'; tx.update(quota, { [field]: Math.max(0, (usage.data()?.[field] || 0) - value.size) }); tx.update(ref, { uploadStatus: 'deleted' }); tx.set(root, { recordIds: FieldValue.arrayRemove(recordId), ...(state.data()?.activeId === recordId ? { activeId: null } : {}), ...(state.data()?.draftId === recordId ? { draftId: null } : {}) }, { merge: true }); });
        }
        return { deleted: true };
    }
    throw new ApiError(405, '요청 방법을 확인해 주세요.');
}
