// 동료 공유: pure rules for sharing a folder with colleagues and for what a colleague may see and copy.
// A colleague sees a set only when all three hold: its folder is shared with their Google email, the owner marked the set 공유,
// and it is not archived. Copying also needs the owner's 복제 허용. Sets are private until the owner says otherwise.
export type CardSetSharing = {visibility: 'private' | 'shared'; allowCopy: boolean};
export const CARD_SHARE_MEMBERS = 30;
export const CARD_SHARED_FOLDERS = 50;
export const CARD_SHARE_SEARCH_LIMIT = 100;
export const privateSharing: CardSetSharing = {visibility: 'private', allowCopy: false};

export function readSharing(value: unknown): CardSetSharing {
  const raw = value as Partial<CardSetSharing> | null | undefined;
  return raw?.visibility === 'shared' ? {visibility: 'shared', allowCopy: raw.allowCopy === true} : privateSharing;
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/u;
/** Colleague emails from a textarea or a list: trimmed, lower-cased, deduplicated, the owner left out. Returns an error message for anything off. */
export function parseShareMembers(value: unknown, ownerEmail: string | null): {members: string[]} | {error: string} {
  const raw = typeof value === 'string' ? value.split(/[\s,;]+/u) : Array.isArray(value) ? value : null;
  if (!raw) return {error: '공유할 선생님의 이메일을 확인해 주세요.'};
  const owner = (ownerEmail ?? '').toLowerCase(), members: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') return {error: '공유할 선생님의 이메일을 확인해 주세요.'};
    const email = entry.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL.test(email) || email.length > 254) return {error: `이메일을 확인해 주세요: ${email.slice(0, 60)}`};
    if (email !== owner && !members.includes(email)) members.push(email);
  }
  if (members.length > CARD_SHARE_MEMBERS) return {error: `한 폴더는 선생님 ${CARD_SHARE_MEMBERS}명까지 공유할 수 있어요.`};
  return {members};
}
/** What a colleague can do with one set. `viewerEmail` comes from the verified Google account. */
export function sharedAccess(set: {ownerUid: string; folderId: string | null; archived?: boolean; sharing?: unknown}, folder: {ownerUid: string; shareMembers?: unknown} | undefined, viewer: {uid: string; email: string | null}) {
  const sharing = readSharing(set.sharing), email = viewer.email?.toLowerCase() ?? '';
  const members = Array.isArray(folder?.shareMembers) ? folder!.shareMembers as unknown[] : [];
  const visible = !!folder && !!email && set.ownerUid !== viewer.uid && folder.ownerUid === set.ownerUid && !!set.folderId && !set.archived && sharing.visibility === 'shared' && members.includes(email);
  return {visible, copy: visible && sharing.allowCopy};
}
/** Search within what is shared with this teacher: every word must appear in the title or description. */
export function matchesShared(row: {title: string; description?: string; ownerName?: string; folderName?: string}, query: string) {
  const words = query.normalize('NFKC').toLocaleLowerCase('ko-KR').split(/\s+/u).filter(Boolean);
  const haystack = `${row.title} ${row.description ?? ''} ${row.ownerName ?? ''} ${row.folderName ?? ''}`.normalize('NFKC').toLocaleLowerCase('ko-KR');
  return words.every(word => haystack.includes(word));
}
