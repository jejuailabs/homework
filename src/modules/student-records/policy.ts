import type { RecordKind, StudentRow } from './types';

/** Pure rules for 학생별 모아 보기: the period, and the spreadsheet file. */
export class RecordInputError extends Error {}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const valid = (value: unknown): value is string => typeof value === 'string' && DATE.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const SEOUL = 9 * 3_600_000;
export const seoulDay = (now = Date.now()) => new Date(now + SEOUL).toISOString().slice(0, 10);

/** Defaults to the last 180 days, about one semester. At most 400 days. */
export function recordPeriod(from: unknown, to: unknown, now = Date.now()) {
  const end = to ? (valid(to) ? to : null) : seoulDay(now), start = from ? (valid(from) ? from : null) : seoulDay(now - 180 * 86_400_000);
  if (!end || !start) throw new RecordInputError('기간을 올바른 날짜로 입력해 주세요.');
  if (start > end) throw new RecordInputError('시작일이 종료일보다 늦어요.');
  if (Date.parse(end) - Date.parse(start) > 400 * 86_400_000) throw new RecordInputError('기간은 400일까지 고를 수 있어요.');
  return {from: start, to: end};
}

/** A cell that begins with = + - @ would run as a formula in a spreadsheet: it gets a leading quote. */
export function cell(value: string | number) {
  const text = String(value).replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t]/.test(text) ? "'" + text : text;
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
/** CSV with a byte-order mark so Excel reads Korean correctly. One row per record. */
export function recordsCsv(students: StudentRow[], kinds: RecordKind[], labels: Record<RecordKind, string>) {
  const rows = [['번호', '이름', '날짜', '종류', '제목', '내용']];
  for (const student of students) for (const record of student.records) if (kinds.includes(record.kind)) rows.push([String(student.number || ''), student.name, record.date, labels[record.kind], record.title, record.text]);
  return '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
