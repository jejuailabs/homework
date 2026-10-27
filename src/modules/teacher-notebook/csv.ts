import {studentKey} from './mentions';
import type {NotebookEntry} from './types';

const csvCell = (value: string) => {
  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function reportCsv(entries: NotebookEntry[], names: Map<string, string>, tagLabels: Record<string, string>) {
  const rows = [['날짜', '학생', '분류', '민감', '기록'], ...entries.map(entry => [entry.date, entry.students.map(ref => names.get(studentKey(ref)) ?? '(명단에 없음)').join(', ') || '학급 전체', entry.tags.map(tag => tagLabels[tag] ?? tag).join(', '), entry.sensitive ? '예' : '', entry.body])];
  return '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
