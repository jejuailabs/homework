/** Download names like "심지후_레코더영상학교종이땡.mp4": who made it, then what it was for. */
export const FILE_TITLE_CHARS = 10;

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
};

/** Letters and digits only (spaces and symbols dropped), first ten characters; Korean counts per syllable. */
export function titlePart(title: unknown, fallback = '파일') {
  const clean = [...String(title ?? '').normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '')].slice(0, FILE_TITLE_CHARS).join('');
  return clean || fallback;
}

export function personPart(name: unknown, fallback = '학생') {
  const clean = String(name ?? '').normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 20);
  return clean || fallback;
}

/** The original file's extension when it looks valid, otherwise one from the stored content type. */
export function extensionOf(fileName: unknown, contentType?: unknown) {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(String(fileName ?? ''));
  return match ? match[1].toLowerCase() : extensions[String(contentType ?? '')] ?? '';
}

/** `index` counts a person's files for the same work from 1; the first keeps the plain name, later ones get _2, _3. */
export function friendlyFileName(person: unknown, title: unknown, extension: string, index = 1, titleFallback?: string) {
  return `${personPart(person)}_${titlePart(title, titleFallback)}${index > 1 ? `_${index}` : ''}${extension ? `.${extension}` : ''}`;
}

/** Content-Disposition that keeps the file viewable in the browser but saves it under the friendly name. */
export function downloadDisposition(fileName: string, mode: 'inline' | 'attachment' = 'inline') {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
