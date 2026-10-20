import 'server-only';
import {bucket} from './admin';
import {ApiError} from './policy';
import {FILE_CACHE_CONTROL} from '../storage-cache';

/** The validated web session grants one exact-size object upload. The browser
 * no longer needs a second, independently persisted Firebase Auth session. */
export async function createUploadTransfer(path: string, contentType: string, size: number, origin: string) {
  const [uploadUrl] = await bucket().file(path).createResumableUpload({
    origin, metadata: {contentType, contentLength: size, cacheControl: FILE_CACHE_CONTROL}, preconditionOpts: {ifGenerationMatch: 0},
  });
  return {uploadUrl, uploadHeaders: {'Content-Type': contentType}};
}
export async function awaitUploadTransfer(ref: FirebaseFirestore.DocumentReference, previous: FirebaseFirestore.DocumentData | null) {
  if (!previous || previous.uploadUrl || previous.status === 'submitted') return previous;
  // A concurrent retry of the same request waits for its first session. It must
  // not issue another bearer URL that cancellation would be unable to revoke.
  for (let attempt=0;attempt<30;attempt++) {
    await new Promise(resolve=>setTimeout(resolve,100));
    const current=await ref.get();
    if (!current.exists) throw new ApiError(409,'전송을 다시 시작해 주세요.','UPLOAD_INVALID');
    if (current.data()?.uploadUrl) return current.data()!;
  }
  throw new ApiError(503,'전송을 준비하고 있어요. 다시 시도해 주세요.','UPLOAD_PREPARING');
}
export async function cancelUploadTransfer(uploadUrl?: string) {
  if (!uploadUrl) return; // Legacy manifests expire under the old Storage rules.
  const url = new URL(uploadUrl), local = process.env.STORAGE_EMULATOR_HOST || '';
  if (url.hostname !== 'storage.googleapis.com' && !(local && url.origin === new URL(local.startsWith('http') ? local : `http://${local}`).origin)) throw new ApiError(500, '전송 주소를 확인하지 못했어요.', 'UPLOAD_TRANSFER');
  const response = await fetch(uploadUrl, {method: 'DELETE', signal: AbortSignal.timeout(15000)});
  // 499 is Google's successful cancellation response. A finished/expired session
  // may return 404/410; its immutable object is deleted separately afterwards.
  if (![200, 204, 404, 410, 499].includes(response.status)) throw new ApiError(503, '전송 정리를 다시 시도해 주세요.', 'UPLOAD_CLEANUP');
}
