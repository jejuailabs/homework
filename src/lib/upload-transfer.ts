export type UploadTransfer = {uploadId: string; path: string; uploadUrl: string; uploadHeaders: Record<string, string>; alreadyUploaded?: boolean; thumbnail?: {uploadUrl: string; uploadHeaders: Record<string, string>; alreadyUploaded?: boolean}};
export const UPLOAD_STALL_MS = 60_000;
export class UploadTransferError extends Error {constructor(public code: string) {super(code);}}

/** Network retries resume the same server reservation, never a new quota charge. */
export async function sendUpload(transfer: UploadTransfer, file: File, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  if (transfer.alreadyUploaded) {onProgress(1); return;}
  let offset = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        // A slow phone network may need several minutes for a 3-minute video, so only
        // a stalled transfer (no bytes accepted for a while) counts as a timeout.
        let stalled = false, idle: ReturnType<typeof setTimeout> | undefined;
        const watch = () => {clearTimeout(idle); idle = setTimeout(() => {stalled = true; xhr.abort();}, UPLOAD_STALL_MS);};
        const finish = (error?: UploadTransferError) => {clearTimeout(idle); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve();};
        xhr.open('PUT', transfer.uploadUrl);
        for (const [key, value] of Object.entries(transfer.uploadHeaders)) xhr.setRequestHeader(key, value);
        xhr.setRequestHeader('Content-Range', `bytes ${offset}-${file.size - 1}/${file.size}`);
        xhr.upload.onprogress = event => {watch(); if (event.lengthComputable) onProgress((offset + event.loaded) / file.size);};
        xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new UploadTransferError(`UPLOAD_HTTP_${xhr.status}`));
        xhr.onerror = () => finish(new UploadTransferError('UPLOAD_NETWORK'));
        xhr.ontimeout = () => finish(new UploadTransferError('UPLOAD_TIMEOUT'));
        xhr.onabort = () => finish(new UploadTransferError(stalled ? 'UPLOAD_TIMEOUT' : 'UPLOAD_CANCELLED'));
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) {finish(new UploadTransferError('UPLOAD_CANCELLED')); return;}
        watch(); xhr.send(file.slice(offset));
      });
      onProgress(1); return;
    } catch (error) {
      if (attempt === 2 || signal?.aborted || !['UPLOAD_NETWORK', 'UPLOAD_TIMEOUT'].includes((error as UploadTransferError).code)) throw error;
      const response = await fetch(transfer.uploadUrl, {method: 'PUT', headers: {'Content-Range': `bytes */${file.size}`}, signal});
      if (response.ok) {onProgress(1); return;}
      if (response.status !== 308) throw error;
      const range = response.headers.get('Range'); offset = range ? Number(range.split('-').at(-1)) + 1 : 0;
    }
  }
}
export async function discardUpload(url: string) {
  // keepalive also lets a dialog close cancel its staged upload. Failed deletion
  // remains server-visible for scheduled retry instead of silently freeing quota.
  const response = await fetch(url, {method: 'DELETE', keepalive: true});
  if (!response.ok) throw new UploadTransferError('UPLOAD_CLEANUP');
}
