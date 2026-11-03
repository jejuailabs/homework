import 'server-only';
import {db} from './admin';
import {stableReadUrl} from './signed-urls';
import {ApiError, id} from './policy';
import {safeSegment, uniqueNames} from '../storage-export';
import {artworkToday} from '../exhibition-metadata';
import {ARCHIVE_DOWNLOAD_LIMIT, csv, effectiveTags, normalizeTags, type ArchiveRow} from '../exhibition-tags';
import {EXHIBITION_ARTWORK_LIMIT} from './exhibition-policy';

/**
 * 전시 보관함: every exhibition of one teacher with its metadata (tags, date, class, source), plus the ZIP file list
 * and bulk tag edits. Berry's search_exhibitions reads the same rows through the same filter.
 */
type Data = Record<string, any>;
export const ARCHIVE_ROW_LIMIT = 500;
const now = () => new Date().toISOString();
const STATUS = {draft: '준비 중', open: '열림', closed: '마감'} as Record<string, string>;
const REVIEW = {approved: '전시 중', pending: '승인 대기', revision: '다시 하기'} as Record<string, string>;

export function archiveRow(doc: FirebaseFirestore.DocumentSnapshot): ArchiveRow {
  const value = doc.data() as Data;
  return {
    id: doc.id, title: String(value.title ?? ''), description: String(value.description ?? ''), classId: String(value.classId ?? ''), className: String(value.className ?? ''),
    status: String(value.status ?? 'draft'), tags: effectiveTags(value), createdAt: String(value.createdAt ?? ''), source: value.linkedAssignmentId ? 'homework' : 'direct',
    artworkCount: Number(value.artworkCount ?? 0), approvedCount: Number(value.approvedCount ?? 0),
  };
}

/** Newest first; a teacher's whole collection fits, older rooms past the limit stay in storage untouched. */
export async function archiveRows(ownerUid: string) {
  const snap = await db().collection('exhibitions').where('ownerUid', '==', ownerUid).orderBy('createdAt', 'desc').limit(ARCHIVE_ROW_LIMIT).get();
  return snap.docs.map(archiveRow);
}

async function ownedRooms(ownerUid: string, raw: unknown, max: number) {
  if (!Array.isArray(raw) || !raw.length || raw.length > max) throw new ApiError(400, `전시실은 한 번에 1~${max}개까지 골라 주세요.`, 'ARCHIVE_SIZE');
  const rooms = await db().getAll(...[...new Set(raw.map(value => id(value)))].map(value => db().doc(`exhibitions/${value}`)));
  if (rooms.some(room => !room.exists || room.data()?.ownerUid !== ownerUid)) throw new ApiError(404, '전시실을 찾을 수 없어요.', 'NOT_FOUND');
  return rooms;
}

/** Folder per room ("2026-04-10 봄꽃 그리기"), images named 번호_작가_제목, and a 작품목록.csv inside each folder. */
export async function archiveFiles(ownerUid: string, raw: unknown) {
  const rooms = await ownedRooms(ownerUid, raw, ARCHIVE_DOWNLOAD_LIMIT);
  const folders = uniqueNames(rooms.map(room => ({paths: [], size: 0, name: safeSegment(`${artworkToday(new Date(room.data()!.createdAt))} ${room.data()!.title}`)}))).map(item => item.name);
  const sets = await Promise.all(rooms.map(async (room, index) => {
    const value = room.data()!, row = archiveRow(room), folder = folders[index];
    const works = (await room.ref.collection('artworks').limit(EXHIBITION_ARTWORK_LIMIT).get()).docs.map(doc => ({...doc.data(), id: doc.id} as Data))
      .filter(work => work.displayPath).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const named = uniqueNames(works.map((work, order) => ({paths: [], size: 0, name: `${folder}/${String(order + 1).padStart(3, '0')}_${safeSegment(work.artistName || work.studentName || '선생님')}_${safeSegment(work.title, '작품')}.webp`})));
    const files = await Promise.all(works.map(async (work, order) => ({name: named[order].name, url: await stableReadUrl(work.displayPath)})));
    const sheet = csv([
      ['번호', '작품 제목', '작가', '작품 날짜', '상태', '영상', '작품 설명'],
      ...works.map((work, order) => [order + 1, work.title, work.artistName || work.studentName || '', work.artworkDate || artworkToday(new Date(work.createdAt)), REVIEW[work.status] ?? work.status, work.videoPath ? '있음(대표 사진만 담김)' : '', work.description]),
    ]);
    return {id: room.id, folder, summary: [row.title, row.className, artworkToday(new Date(row.createdAt)), STATUS[row.status] ?? row.status, row.source === 'homework' ? '숙제 연동' : '직접 올림', row.tags.map(tag => `#${tag}`).join(' '), works.length, value.description ?? ''], sheet, files};
  }));
  const index = csv([['전시 이름', '학급', '연 날짜', '상태', '들어온 길', '해시태그', '작품 수', '전시 소개'], ...sets.map(set => set.summary)]);
  return {zipName: `전시보관함_${artworkToday()}.zip`, index, sets: sets.map(({summary: _summary, ...set}) => set)};
}

/** Adds or removes the same tags on many rooms; edited rooms keep their tags from then on. */
export async function archiveTags(ownerUid: string, input: Data) {
  const rooms = await ownedRooms(ownerUid, input.ids, ARCHIVE_ROW_LIMIT);
  const add = normalizeTags(input.add), remove = new Set(normalizeTags(input.remove));
  if (!add.length && !remove.size) throw new ApiError(400, '붙이거나 뗄 해시태그를 입력해 주세요.', 'TAGS_EMPTY');
  const updated = rooms.map(room => ({ref: room.ref, tags: normalizeTags([...effectiveTags(room.data()!).filter(tag => !remove.has(tag)), ...add])}));
  for (let start = 0; start < updated.length; start += 400) {
    const batch = db().batch();
    updated.slice(start, start + 400).forEach(item => batch.update(item.ref, {tags: item.tags, tagsEdited: true, updatedAt: now()}));
    await batch.commit();
  }
  return {updated: updated.length, rows: updated.map(item => ({id: item.ref.id, tags: item.tags}))};
}
