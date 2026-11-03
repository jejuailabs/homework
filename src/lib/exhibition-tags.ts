/**
 * Exhibition metadata shared by the archive menu and Berry: topic hashtags made from the room's own words,
 * plus one filter so a teacher's menu and Berry's search always find the same rooms.
 */
export const EXHIBITION_TAG_LIMIT = 10;
export const EXHIBITION_TAG_LENGTH = 20;
export const ARCHIVE_DOWNLOAD_LIMIT = 20;

export type ArchiveSource = 'direct' | 'homework';
export type ArchiveRow = {
  id: string; title: string; description: string; classId: string; className: string; status: string;
  tags: string[]; createdAt: string; source: ArchiveSource; artworkCount: number; approvedCount: number;
};
export type ArchiveFilter = {q?: string; tags?: string[]; from?: string; to?: string; classId?: string; source?: ArchiveSource | ''};

// Long particles always come off; one-letter ones only from 3+ letter words, so 가을·사과·고양이 stay whole.
const LONG_PARTICLES = /(으로부터|에게서|한테서|에서는|에서도|으로는|으로|에서|에게|한테|까지|부터|처럼|이랑|하고|보다)$/;
const SHORT_PARTICLES = /[은는을를의에와과로]$/;
const stem = (word: string) => {
  const long = word.replace(LONG_PARTICLES, '');
  if (long !== word) return long;
  return word.length >= 3 ? word.replace(SHORT_PARTICLES, '') : word;
};
const STOPWORDS = new Set(['전시', '전시실', '전시회', '작품', '작품들', '우리', '우리반', '우리들', '우리들의', '학년', '숙제', '모음', '모아', '모아보기', '함께', '그리고', '이번', '오늘', '나의', '친구', '친구들', 'the', 'and', 'our', 'class', 'exhibition', 'artwork', 'artworks']);
// Sentence endings (그려요, 만들었다) are not topics.
const VERB_ENDINGS = /(어요|아요|해요|려요|니다|세요|었다|았다|했다|하기)$/;
const SUBJECTS: [string, RegExp][] = [
  ['미술', /그림|그리기|그려|색칠|미술|수채화|판화|포스터|만들기|조형|점토|콜라주|드로잉|스케치/],
  ['과학', /과학|실험|관찰|식물|곤충|동물|날씨|별자리|우주|화산|자석/],
  ['국어', /국어|일기|동시|시화|독서|독후|글쓰기|낱말|받아쓰기|편지/],
  ['사회', /사회|지도|마을|고장|역사|문화재|직업|지역/],
  ['수학', /수학|도형|무늬|규칙|그래프|측정|분수/],
  ['음악', /음악|악기|노래|리코더|가락/],
  ['체육', /체육|운동|달리기|놀이|줄넘기/],
];

/** One hashtag word: no '#', no spaces or symbols, at most 20 characters. Empty when nothing usable is left. */
export function normalizeTag(raw: unknown) {
  return String(raw ?? '').normalize('NFC').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, EXHIBITION_TAG_LENGTH).toLowerCase();
}
export function normalizeTags(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(normalizeTag).filter(Boolean))].slice(0, EXHIBITION_TAG_LIMIT);
}

const seoulDate = (iso: string) => {const time = Date.parse(iso); return Number.isFinite(time) ? new Date(time + 9 * 3_600_000) : null;};
export const archiveMonth = (iso: string) => seoulDate(iso)?.toISOString().slice(0, 7) ?? '';
const season = (month: number) => month >= 3 && month <= 5 ? '봄' : month >= 6 && month <= 8 ? '여름' : month >= 9 && month <= 11 ? '가을' : '겨울';

const topicWords = (text: string) => text.split(/[^\p{L}\p{N}]+/u).map(stem)
  .filter(word => word.length >= 2 && !/^\d+$/.test(word) && !VERB_ENDINGS.test(word) && !STOPWORDS.has(word.toLowerCase()));

/** Topic words of the title (the description's only when the title has fewer than two), then subject, season, month, grade and source. */
export function autoTags(room: {title?: string; description?: string; grade?: unknown; createdAt?: string; linkedAssignmentId?: unknown}) {
  // Descriptions are sentences ("낙엽을 모아 만든 작품"); their words are a fallback, not the topic.
  const titled = normalizeTags(topicWords(room.title ?? ''));
  const words = titled.length >= 2 ? titled : normalizeTags([...titled, ...topicWords((room.description ?? '').slice(0, 200))]);
  const text = `${room.title ?? ''} ${room.description ?? ''}`;
  const subject = SUBJECTS.find(([, pattern]) => pattern.test(text))?.[0];
  const date = seoulDate(room.createdAt ?? ''), month = date ? date.getUTCMonth() + 1 : 0;
  const grade = /^[1-6]$/.test(String(room.grade ?? '').trim()) ? `${String(room.grade).trim()}학년` : '';
  const topic = words.slice(0, 4);
  return normalizeTags([...topic, subject, month ? season(month) : '', month ? `${month}월` : '', grade, room.linkedAssignmentId ? '숙제' : '']);
}

/** Saved tags win; rooms made before tags existed get their automatic ones. */
export const effectiveTags = (room: {tags?: unknown; title?: string; description?: string; grade?: unknown; createdAt?: string; linkedAssignmentId?: unknown}) =>
  Array.isArray(room.tags) ? normalizeTags(room.tags) : autoTags(room);

/** "2026-04" or "2026-04-15"; anything else is ignored. `end` moves a month to its last day. */
export function archiveDay(value: unknown, end = false) {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (!/^\d{4}-\d{2}$/.test(text)) return '';
  if (!end) return `${text}-01`;
  const [year, month] = text.split('-').map(Number);
  return `${text}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Words must all appear in the title, description or tags; picked tags must all be on the room. */
export function filterArchive(rows: ArchiveRow[], filter: ArchiveFilter) {
  const words = String(filter.q ?? '').toLowerCase().split(/\s+/).map(word => word.replace(/^#+/, '')).filter(Boolean);
  const tags = normalizeTags(filter.tags ?? []);
  const from = archiveDay(filter.from), to = archiveDay(filter.to, true);
  return rows.filter(row => {
    const day = seoulDate(row.createdAt)?.toISOString().slice(0, 10) ?? '';
    const haystack = `${row.title} ${row.description} ${row.tags.join(' ')}`.toLowerCase();
    return words.every(word => haystack.includes(word)) && tags.every(tag => row.tags.includes(tag))
      && (!from || day >= from) && (!to || day <= to)
      && (!filter.classId || row.classId === filter.classId) && (!filter.source || row.source === filter.source);
  });
}

/** Most used tags first, for the chips above the list. */
export function tagCounts(rows: ArchiveRow[], limit = 24) {
  const counts = new Map<string, number>();
  rows.forEach(row => row.tags.forEach(tag => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([tag, count]) => ({tag, count}));
}

/** Spreadsheet text for the ZIP: Excel opens Korean correctly with the BOM. */
export function csv(rows: unknown[][]) {
  const cell = (value: unknown) => {const text = String(value ?? ''); return /[",\n\r]/.test(text) || /^[=+\-@]/.test(text) ? `"${(/^[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"` : text;};
  return '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
