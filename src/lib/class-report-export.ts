import type {ClassReportSnapshot} from './lesson-report-types';

type Value = string | number;
const escapeHtml = (value: Value) => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]!));
const csvCell = (value: Value) => {
  const text = String(value);
  // Quoting alone does not prevent spreadsheet formula execution.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function reportTimestamp(value: string, en: boolean) {
  return new Date(value).toLocaleString(en ? 'en-GB' : 'ko-KR', {timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short'});
}
export function reportScope(en: boolean) {
  return en
    ? 'Activities created in the selected period, with their current status at capture. Lesson records use their lesson date. This is not a reconstruction of past status. Dates and times use Korea Standard Time.'
    : '선택한 기간에 만든 활동의 상태를 집계 시점 기준으로 담았어요. 수업 기록은 수업 날짜를 기준으로 포함합니다. 과거 당시의 상태를 복원한 보고서는 아니며, 날짜와 시간은 한국 표준시 기준입니다.';
}
export function classReportCsv(report: ClassReportSnapshot, en: boolean, students: boolean) {
  const w = (ko: string, english: string) => en ? english : ko;
  const rows: Value[][] = [
    [w('보고서', 'Report'), report.title], [w('학급', 'Class'), report.className],
    [w('기간', 'Period'), report.from, report.to], [w('집계 시점', 'Captured'), report.capturedAt],
    [w('버전', 'Version'), report.version], [w('집계 범위', 'Scope'), reportScope(en)], [],
    [w('집계', 'Summary'), w('값', 'Value')],
    [w('현재 활동 학생', 'Active students'), report.metrics.students],
    [w('과제 수', 'Assignments'), report.metrics.assignments], [w('과제 대상 합계', 'Assignment targets'), report.metrics.targets],
    [w('미제출', 'Pending'), report.metrics.pending], [w('제출', 'Submitted'), report.metrics.submitted],
    [w('확인 완료', 'Reviewed'), report.metrics.done], [w('수정 요청', 'Revision requested'), report.metrics.revision],
    [w('카드 세트', 'Card sets'), report.metrics.cardSets], [w('제출한 테스트', 'Submitted card tests'), report.metrics.cardAttempts],
    [w('게시판', 'Boards'), report.metrics.boards], [w('게시글', 'Posts'), report.metrics.boardPosts],
    [w('전시', 'Exhibitions'), report.metrics.exhibitions], [w('작품', 'Artworks'), report.metrics.artworks],
    [w('수업 기록', 'Lesson records'), report.metrics.lessons], [],
    [w('과제', 'Assignment'), w('대상', 'Targets'), w('미제출', 'Pending'), w('제출', 'Submitted'), w('확인 완료', 'Reviewed'), w('수정 요청', 'Revision')],
    ...report.assignments.map(row => [row.title, row.targetCount, row.pending, row.submitted, row.done, row.revision]), [],
    [w('카드 세트', 'Card set'), w('대상', 'Targets'), w('제출한 테스트', 'Submitted tests')],
    ...report.cards.map(row => [row.title, row.targetCount, row.attempts]), [],
    [w('게시판', 'Board'), w('게시글', 'Posts')], ...report.boards.map(row => [row.title, row.postCount]), [],
    [w('전시', 'Exhibition'), w('작품', 'Artworks')], ...report.exhibitions.map(row => [row.title, row.artworkCount]), [],
    [w('수업 날짜', 'Lesson date'), w('수업', 'Lesson'), w('교과', 'Subject'), w('단원', 'Unit'), w('목표', 'Objective'), w('기록', 'Notes'), w('연결 자료', 'Resources')],
    ...report.lessons.map(row => [row.date, row.title, row.subject, row.unit, row.objective, row.notes, row.links.map(link => link.title).join(' / ')]), [],
    [w('교사 기록', 'Teacher notes'), report.teacherNotes], [w('보고서 설명', 'Narrative'), report.narrative],
  ];
  if (students) rows.push([], [w('학생별 부록', 'Student appendix')],
    [w('번호', 'Number'), w('이름', 'Name'), w('상태', 'Status'), w('과제 대상', 'Assignments'), w('제출', 'Submitted'), w('확인 완료', 'Reviewed'), w('수정 요청', 'Revision'), w('카드 진행 세트', 'Card sets with progress'), w('제출한 테스트', 'Submitted tests'), w('세트별 최근 점수', 'Latest score per set'), w('보유 포인트', 'Point balance')],
    ...report.students.map(row => [row.number, row.name, row.active ? w('활동', 'Active') : w('비활성', 'Inactive'), row.assignments, row.submitted, row.done, row.revision, row.cardSessions, row.cardAttempts, row.latestScores.join(' / '), row.points]));
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function classReportJson(report: ClassReportSnapshot, students: boolean) {
  const {students: roster, ...summary} = report;
  return JSON.stringify({...summary, ...(students ? {students: roster} : {}), studentAppendixIncluded: students}, null, 2);
}
export function classReportHtml(report: ClassReportSnapshot, en: boolean, students: boolean) {
  const w = (ko: string, english: string) => en ? english : ko;
  const table = (headers: string[], rows: Value[][]) => `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">${w('이 기간에 만든 활동이 없어요.', 'No activities created in this period.')}</td></tr>`}</tbody></table>`;
  const section = (title: string, content: string) => `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
  const paragraphs = (value: string) => `<p class="prose">${escapeHtml(value || '—')}</p>`;
  const metrics = [[w('활동 학생', 'Active students'), report.metrics.students], [w('과제', 'Assignments'), report.metrics.assignments], [w('카드 세트', 'Card sets'), report.metrics.cardSets], [w('게시글', 'Posts'), report.metrics.boardPosts], [w('작품', 'Artworks'), report.metrics.artworks], [w('수업 기록', 'Lessons'), report.metrics.lessons]];
  const body = `<header><div class="eyebrow">CLASSROOM JOURNAL · ${w('버전', 'VERSION')} ${report.version}</div><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.className)} · ${escapeHtml(report.from)} — ${escapeHtml(report.to)}</p><p class="muted">${w('집계 시점', 'Captured')}: ${escapeHtml(reportTimestamp(report.capturedAt, en))} · KST<br>${w('저장 시점', 'Saved')}: ${escapeHtml(reportTimestamp(report.createdAt, en))} · KST</p></header><p class="scope">${escapeHtml(reportScope(en))}</p><div class="metrics">${metrics.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>`
    + section(w('과제 현황', 'Assignments'), table([w('과제', 'Assignment'), w('대상', 'Targets'), w('미제출', 'Pending'), w('제출', 'Submitted'), w('확인 완료', 'Reviewed'), w('수정 요청', 'Revision')], report.assignments.map(row => [row.title, row.targetCount, row.pending, row.submitted, row.done, row.revision])))
    + section(w('카드 학습', 'Card learning'), table([w('세트', 'Set'), w('대상', 'Targets'), w('제출한 테스트', 'Submitted tests')], report.cards.map(row => [row.title, row.targetCount, row.attempts])))
    + section(w('참여 게시판', 'Participation boards'), table([w('게시판', 'Board'), w('게시글', 'Posts')], report.boards.map(row => [row.title, row.postCount])))
    + section(w('전시 활동', 'Exhibitions'), table([w('전시', 'Exhibition'), w('작품', 'Artworks')], report.exhibitions.map(row => [row.title, row.artworkCount])))
    + section(w('수업 기록', 'Lesson records'), report.lessons.length ? report.lessons.map(lesson => `<article><h3>${escapeHtml(lesson.date)} · ${escapeHtml(lesson.title)}</h3><p class="muted">${escapeHtml([lesson.subject, lesson.unit].filter(Boolean).join(' · '))}</p>${lesson.objective ? paragraphs(`${w('목표', 'Objective')}: ${lesson.objective}`) : ''}${paragraphs(lesson.notes)}${lesson.links.length ? `<p class="muted">${w('연결 자료', 'Resources')}: ${escapeHtml(lesson.links.map(link => link.title).join(' / '))}</p>` : ''}</article>`).join('') : paragraphs(w('저장된 수업 기록이 없어요.', 'No saved lesson records.')))
    + section(w('교사 기록', 'Teacher notes'), paragraphs(report.teacherNotes))
    + (report.narrative ? section(w('보고서 설명', 'Narrative'), paragraphs(report.narrative)) : '')
    + (students ? section(w('학생별 부록', 'Student appendix'), `<p class="muted">${w('학생 상태와 보유 포인트도 집계 시점 기준입니다.', 'Student status and point balances are also captured at the snapshot time.')}</p>` + table([w('번호·이름', 'Student'), w('상태', 'Status'), w('과제', 'Assigned'), w('제출', 'Submitted'), w('확인', 'Reviewed'), w('수정', 'Revision'), w('테스트', 'Tests'), w('최근 점수', 'Latest scores'), w('포인트', 'Points')], report.students.map(row => [`${row.number}. ${row.name}`, row.active ? w('활동', 'Active') : w('비활성', 'Inactive'), row.assignments, row.submitted, row.done, row.revision, row.cardAttempts, row.latestScores.join(' / ') || '—', row.points]))) : '')
    + `<footer>${w('저장된 보고서 · 집계 데이터는 이후 활동과 관계없이 유지됩니다.', 'Saved report · Captured data stays unchanged by later activity.')}<br>${escapeHtml(report.id)}</footer>`;
  return `<!doctype html><html lang="${en ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>@page{size:A4;margin:17mm}*{box-sizing:border-box}body{font:13px/1.65 Arial,"Malgun Gothic",sans-serif;color:#243e36;margin:0;background:#fff}main{max-width:850px;margin:auto;padding:32px}header{border-bottom:3px solid #52776b;padding-bottom:18px}h1{font-size:28px;line-height:1.35;margin:9px 0}h2{font-size:17px;margin:24px 0 10px}h3{font-size:14px;margin:0 0 6px}p{margin:7px 0}.eyebrow{letter-spacing:2px;font-size:10px;color:#52776b}.muted,footer{color:#61766e;font-size:11px}.scope{padding:13px 15px;background:#f2f5f3;font-size:11px;margin:18px 0}.metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.metrics>div{border:1px solid #d5e0dc;padding:12px 5px;text-align:center}.metrics strong{font-size:24px;display:block}.metrics span{font-size:11px}table{border-collapse:collapse;width:100%;font-size:11px;table-layout:auto}th,td{border-bottom:1px solid #d5e0dc;text-align:left;padding:8px 6px;overflow-wrap:anywhere}th{background:#f2f5f3;white-space:normal}tr,article,.metrics{break-inside:avoid}thead{display:table-header-group}article{padding:12px 0;border-bottom:1px solid #d5e0dc}.prose{white-space:pre-wrap;overflow-wrap:anywhere}footer{border-top:1px solid #d5e0dc;margin-top:28px;padding-top:12px;overflow-wrap:anywhere}.print-action{display:block;margin:20px auto;border:0;border-radius:8px;background:#3c6758;color:#fff;padding:12px 20px;font:inherit;cursor:pointer}@media print{main{padding:0;max-width:none}.print-action{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2,h3{break-after:avoid}}</style></head><body><main>${body}</main></body></html>`;
}
