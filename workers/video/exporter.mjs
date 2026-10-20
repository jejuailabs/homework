import {crc32} from 'node:zlib';
import {once} from 'node:events';

/**
 * Minimal streaming ZIP (STORE, no compression): photos and videos are already
 * compressed, so re-deflating would only burn CPU. Parts stay under 2GiB, which
 * keeps every offset inside the classic 32-bit ZIP format.
 */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()};
}
export function zipWriter(write) {
  let offset = 0;
  const entries = [], put = async buffer => {await write(buffer); offset += buffer.length;};
  return {
    async add(name, chunks, modified = new Date()) {
      const nameBytes = Buffer.from(name, 'utf8'), stamp = dosDateTime(modified), start = offset, header = Buffer.alloc(30);
      // Flags: bit 3 = sizes/CRC follow in a data descriptor, bit 11 = UTF-8 names (Korean folder names).
      header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0808, 6); header.writeUInt16LE(0, 8);
      header.writeUInt16LE(stamp.time, 10); header.writeUInt16LE(stamp.date, 12); header.writeUInt16LE(nameBytes.length, 26);
      await put(header); await put(nameBytes);
      let crc = 0, size = 0;
      for await (const chunk of chunks) {crc = crc32(chunk, crc); size += chunk.length; await put(chunk);}
      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc >>> 0, 4); descriptor.writeUInt32LE(size, 8); descriptor.writeUInt32LE(size, 12);
      await put(descriptor);
      entries.push({nameBytes, crc: crc >>> 0, size, start, stamp});
      return size;
    },
    async finish() {
      const directoryStart = offset;
      for (const entry of entries) {
        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0808, 8); record.writeUInt16LE(0, 10);
        record.writeUInt16LE(entry.stamp.time, 12); record.writeUInt16LE(entry.stamp.date, 14); record.writeUInt32LE(entry.crc, 16);
        record.writeUInt32LE(entry.size, 20); record.writeUInt32LE(entry.size, 24); record.writeUInt16LE(entry.nameBytes.length, 28); record.writeUInt32LE(entry.start, 42);
        await put(record); await put(entry.nameBytes);
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
      end.writeUInt32LE(offset - directoryStart, 12); end.writeUInt32LE(directoryStart, 16);
      await put(end);
      return offset;
    },
  };
}

const extensions = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf'};
const now = () => new Date().toISOString();

/** Builds one ZIP part of a teacher's final download. Missing files are skipped and counted, never fatal. */
export async function processExportPart({db, bucket}, exportId, part) {
  if (!/^[0-9a-f-]{36}$/.test(exportId) || !Number.isInteger(part) || part < 0 || part > 10000) throw Object.assign(new Error('EXPORT_INVALID'), {retryable: false});
  const parentRef = db.doc(`storageExports/${exportId}`), ref = parentRef.collection('parts').doc(String(part));
  const claimed = await db.runTransaction(async tx => {
    const [parent, doc] = await Promise.all([tx.get(parentRef), tx.get(ref)]), value = doc.data();
    if (!parent.exists || !value || value.status === 'complete') return null;
    if (value.status === 'processing' && Date.parse(value.leaseExpiresAt) > Date.now()) return null;
    tx.update(ref, {status: 'processing', leaseExpiresAt: new Date(Date.now() + 1_200_000).toISOString(), attempts: (value.attempts || 0) + 1, startedAt: now()});
    return {...value, attempts: (value.attempts || 0) + 1, ownerUid: parent.data().ownerUid};
  });
  if (!claimed) return;
  const zipPath = `exports/${claimed.ownerUid}/${exportId}/part-${part}.zip`, started = Date.now();
  const output = bucket.file(zipPath).createWriteStream({resumable: true, metadata: {contentType: 'application/zip', cacheControl: 'private,max-age=86400'}});
  let failed = null;
  output.on('error', error => {failed = error;});
  const write = async buffer => {if (failed) throw failed; if (!output.write(buffer)) await once(output, 'drain');};
  try {
    const zip = zipWriter(write);
    let skipped = 0;
    for (const file of claimed.files) {
      let source = null, metadata = null;
      for (const path of file.paths) {
        const candidate = bucket.file(path), [found] = await candidate.exists();
        if (found) {[metadata] = await candidate.getMetadata(); source = candidate; break;}
      }
      if (!source) {skipped++; continue;}
      const name = file.appendExtension ? `${file.name}.${extensions[metadata.contentType] || 'bin'}` : file.name;
      await zip.add(name, source.createReadStream(), new Date(metadata.updated || Date.now()));
    }
    await zip.finish();
    output.end(); await once(output, 'finish');
    if (failed) throw failed;
    const [saved] = await bucket.file(zipPath).getMetadata();
    await ref.update({status: 'complete', zipPath, zipSize: Number(saved.size), skipped, finishedAt: now(), elapsedMs: Date.now() - started, leaseExpiresAt: null, files: []});
  } catch (error) {
    output.destroy();
    await bucket.file(zipPath).delete({ignoreNotFound: true}).catch(() => {});
    // Cloud Tasks retries up to five times; only then is the part reported as failed.
    await ref.update({status: claimed.attempts >= 5 ? 'failed' : 'queued', errorCode: String(error.code || error.message || 'EXPORT_FAILED').slice(0, 80), leaseExpiresAt: null});
    throw Object.assign(new Error('EXPORT_PART_FAILED'), {retryable: true});
  }
}
