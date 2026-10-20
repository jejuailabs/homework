/** Final download: every stored file of a teacher, split into ZIP parts a browser can save. */
export const EXPORT_PART_BYTES = 2 * 1024 ** 3;
export const EXPORT_PART_FILES = 1500;
export const EXPORT_KEEP_DAYS = 7;
export type ExportFile = {paths: string[]; name: string; size: number; appendExtension?: boolean};

/** Keeps folder and file names valid on Windows, macOS and phones. */
export function safeSegment(value: unknown, fallback = '이름 없음') {
  const clean = String(value ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 80).trim();
  return clean || fallback;
}

/** Same path twice in one archive would overwrite on extract; later ones get " (2)", " (3)"… */
export function uniqueNames(files: ExportFile[]) {
  const seen = new Map<string, number>();
  return files.map(file => {
    const key = file.name.toLowerCase(), count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return file;
    const dot = file.name.lastIndexOf('.'), slash = file.name.lastIndexOf('/');
    const name = dot > slash + 1 && !file.appendExtension ? `${file.name.slice(0, dot)} (${count})${file.name.slice(dot)}` : `${file.name} (${count})`;
    return {...file, name};
  });
}

/** Parts stay under 2GiB and 1,500 files so each ZIP downloads, opens and fits a Firestore document. */
export function splitExportParts(files: ExportFile[], maxBytes = EXPORT_PART_BYTES, maxFiles = EXPORT_PART_FILES) {
  const parts: ExportFile[][] = [];
  let current: ExportFile[] = [], bytes = 0;
  for (const file of files) {
    if (current.length && (bytes + file.size > maxBytes || current.length >= maxFiles)) {parts.push(current); current = []; bytes = 0;}
    current.push(file); bytes += file.size;
  }
  if (current.length) parts.push(current);
  return parts.map(part => uniqueNames(part));
}
