import type {DayKind, Plan, Slot, Subject} from './engine';
import type {Grid} from './tables';

/**
 * 격자(표) → 시수에 쓰는 값. 학교마다 서식이 달라서 "찾은 것 + 어디서 찾았나 + 얼마나 확실한가"를 같이 돌려주고,
 * 저장은 선생님이 확인 카드에서 고른 것만 한다(조용히 덮어쓰지 않는다). AI를 쓰지 않는 규칙 기반 판독이다.
 */
export type Confidence = 'high' | 'low';
export type StandardFinding = {subjectName: string; subject: string | null; semester: 1 | 2 | null; hours: number; where: string; confidence: Confidence; note?: string};
export type TemplateFinding = {semester: 1 | 2 | null; slots: (Slot & {subjectName: string})[]; unmatched: string[]; where: string; confidence: Confidence};
export type DayFinding = {date: string; until?: string; kind: DayKind; name: string; where: string; confidence: Confidence};
export type Findings = {standards: StandardFinding[]; templates: TemplateFinding[]; days: DayFinding[]; notes: string[]};

const squash = (value: string) => value.replace(/[\s·・()（）]/g, '');
const ALIASES: [RegExp, string][] = [[/^창의적체험활동$|^창체$/, 'cre'], [/^바른생활$/, 'bar'], [/^슬기로운생활$/, 'sul'], [/^즐거운생활$/, 'jul'], [/^영어$|^외국어\(?영어\)?$/, 'eng']];
/** 표 속 교과 이름 → 계획의 교과 키. "사회/도덕"처럼 묶인 교과군 줄은 짝을 정할 수 없어 맞추지 않는다. */
export function matchSubject(name: string, subjects: Subject[]): string | null {
  const key = squash(name);
  if (!key || /[/／]/.test(key)) return null;
  const exact = subjects.find(subject => squash(subject.name) === key || subject.short === key);
  if (exact) return exact.key;
  return ALIASES.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}
const SUBJECT_WORDS = /^(국어|사회|도덕|수학|과학|실과|체육|음악|미술|영어|외국어|창의적체험활동|창체|바른생활|슬기로운생활|즐거운생활|학교자율시간.*|자율활동|동아리활동|봉사활동|진로활동)$/;
const isSubjectCell = (value: string) => SUBJECT_WORDS.test(squash(value));
const number = (value: string) => {const match = value.replace(/,/g, '').match(/^\s*(\d{1,3})(?:\s|\(|$)/); return match ? Number(match[1]) : null;};
const cellName = (grid: Grid, row: number, col: number) => `${grid.name} ${String.fromCharCode(65 + Math.min(col, 25))}${row + 1}`;
const gradeOf = (value: string) => {const match = squash(value).match(/^(\d)학년$/); return match ? Number(match[1]) : null;};
const semesterOf = (value: string): 1 | 2 | null => /1학기/.test(value) ? 1 : /2학기/.test(value) ? 2 : null;

/** 편제표: 교과가 세로(줄)로 있든 가로(칸)로 있든, 우리 학년의 학기별(없으면 연간) 시수를 찾는다. */
export function readStandards(grid: Grid, plan: Plan): StandardFinding[] {
  const cells: {row: number; col: number; value: string}[] = [];
  grid.rows.forEach((row, r) => row.forEach((value, c) => {if (isSubjectCell(value)) cells.push({row: r, col: c, value});}));
  if (cells.length < 4) return [];
  const mode = (values: number[]) => [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<number, number>())].sort((a, b) => b[1] - a[1])[0];
  const [col, colCount] = mode(cells.map(cell => cell.col)), [row, rowCount] = mode(cells.map(cell => cell.row));
  const vertical = colCount >= rowCount, out: StandardFinding[] = [];
  const at = (r: number, c: number) => grid.rows[r]?.[c] ?? '';
  if (vertical) {
    const subjectRows = cells.filter(cell => cell.col === col), top = Math.min(...subjectRows.map(cell => cell.row));
    const columns = gradeColumns(grid, top, plan.grade, (r, c) => at(r, c));
    if (!columns.length) return [];
    for (const cell of subjectRows) for (const target of columns) {
      const hours = number(at(cell.row, target.col));
      if (hours === null) continue;
      out.push({subjectName: cell.value, subject: matchSubject(cell.value, plan.subjects), semester: target.semester, hours, where: cellName(grid, cell.row, target.col), confidence: target.exact && hours <= 400 ? 'high' : 'low', note: target.note});
    }
  } else {
    const subjectCols = cells.filter(cell => cell.row === row), left = Math.min(...subjectCols.map(cell => cell.col));
    const rows = gradeRows(grid, left, plan.grade, (r, c) => at(r, c));
    for (const cell of subjectCols) for (const target of rows) {
      const hours = number(at(target.row, cell.col));
      if (hours === null) continue;
      out.push({subjectName: cell.value, subject: matchSubject(cell.value, plan.subjects), semester: target.semester, hours, where: cellName(grid, target.row, cell.col), confidence: target.exact && hours <= 400 ? 'high' : 'low', note: target.note});
    }
  }
  return out;
}

type Target = {col: number; semester: 1 | 2 | null; exact: boolean; note?: string};
/** 교과 줄 위쪽 머리글에서 "3학년" 칸과 그 아래 "1학기/2학기" 칸을 찾는다. "3~4학년"처럼 학년군만 있으면 확신 낮음. */
function gradeColumns(grid: Grid, top: number, grade: number, at: (r: number, c: number) => string): Target[] {
  const width = Math.max(...grid.rows.map(row => row.length));
  for (let r = top - 1; r >= Math.max(0, top - 4); r--) {
    for (let c = 0; c < width; c++) {
      const value = at(r, c);
      if (gradeOf(value) === grade) {
        let end = c + 1;
        while (end < width && !at(r, end)) end++;
        const subs: Target[] = [];
        for (let k = c; k < end; k++) {const semester = semesterOf(at(r + 1, k)); if (semester && r + 1 < top) subs.push({col: k, semester, exact: true});}
        return subs.length ? subs : [{col: c, semester: null, exact: true}];
      }
      const band = squash(value).match(/^(\d)~(\d)학년(군)?$/);
      if (band && grade >= Number(band[1]) && grade <= Number(band[2])) return [{col: c, semester: null, exact: false, note: '학년군 합계로 보여요. 한 해 값인지 확인해 주세요.'}];
    }
  }
  return [];
}
function gradeRows(grid: Grid, left: number, grade: number, at: (r: number, c: number) => string): {row: number; semester: 1 | 2 | null; exact: boolean; note?: string}[] {
  const out: {row: number; semester: 1 | 2 | null; exact: boolean; note?: string}[] = [];
  let inGrade = false;
  for (let r = 0; r < grid.rows.length; r++) {
    const head = Array.from({length: left}, (_, c) => at(r, c)).join(' ');
    const found = head.split(' ').map(gradeOf).find(value => value !== null);
    if (found !== undefined && found !== null) inGrade = found === grade;
    if (!inGrade) continue;
    const semester = semesterOf(head);
    if (head.trim()) out.push({row: r, semester, exact: true});
  }
  return out.filter(target => target.semester !== null || out.length === 1);
}

/** 기초시간표: "월 화 수 목 금" 머리글 줄 아래 "1(교시)" 줄들. 1·2학기는 표 이름이나 위쪽 글자에서 찾는다. */
export function readTemplate(grid: Grid, plan: Plan): TemplateFinding | null {
  const DAYS = ['월', '화', '수', '목', '금'];
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r], columns = DAYS.map(day => row.findIndex(value => squash(value).replace(/요일$/, '') === day));
    if (columns.filter(index => index >= 0).length < 4) continue;
    const slots: TemplateFinding['slots'] = [], unmatched = new Set<string>();
    for (let k = r + 1; k < grid.rows.length; k++) {
      const label = squash(grid.rows[k].slice(0, Math.max(1, Math.min(...columns.filter(index => index >= 0)))).join(''));
      const period = Number(label.match(/^(\d{1,2})(교시)?/)?.[1]);
      if (!period) {if (slots.length) break; continue;}
      if (period > plan.periodsPerDay) continue;
      columns.forEach((col, index) => {
        if (col < 0) return;
        const value = (grid.rows[k][col] ?? '').trim();
        if (!value) return;
        // 칸 전체로 먼저 맞추고("창의적 체험활동"), 안 되면 첫 낱말로("과학 과학실" → 과학).
        const whole = matchSubject(value, plan.subjects), first = value.split(/\s/)[0], key = whole ?? matchSubject(first, plan.subjects), name = whole ? value : first;
        if (key) slots.push({weekday: index + 1, period, subject: key, subjectName: name}); else unmatched.add(name);
      });
    }
    if (!slots.length) continue;
    const above = grid.rows.slice(Math.max(0, r - 3), r).flat().join(' '), semester = semesterOf(`${grid.name} ${above}`);
    return {semester, slots, unmatched: [...unmatched], where: cellName(grid, r, columns.find(index => index >= 0)!), confidence: unmatched.size === 0 ? 'high' : 'low'};
  }
  return null;
}

/** 학사일정: 줄마다 날짜(또는 기간)와 일정 이름. 달력 모양 표는 확신 낮음으로만 읽거나 건너뛴다. */
export function readDays(grid: Grid, plan: Plan): DayFinding[] {
  const out: DayFinding[] = [];
  grid.rows.forEach((row, r) => {
    let range: {from: string; until?: string} | null = null, nameCell = '', at = -1;
    row.forEach((value, c) => {
      const parsed = range ? null : parseDateRange(value, plan.year);
      if (parsed) {range = parsed; at = c; const rest = value.replace(DATE_TEXT, '').trim(); if (rest.length >= 2 && /[가-힣]/.test(rest)) nameCell = rest;}
      else if (!nameCell && /[가-힣]{2,}/.test(value) && !/^(월|화|수|목|금|토|일)(요일)?$/.test(value.trim())) nameCell = value.trim();
    });
    if (!range || !nameCell) return;
    const found = range as {from: string; until?: string}, kind = kindOf(nameCell);
    if (found.from < plan.startsOn || found.from > plan.endsOn) return;
    out.push({date: found.from, ...(found.until && found.until > found.from ? {until: found.until} : {}), kind: kind ?? 'event', name: nameCell.slice(0, 30), where: cellName(grid, r, at), confidence: kind ? 'high' : 'low'});
  });
  return out;
}
const DATE_TEXT = /(\d{4}\s*[.\-/년]\s*)?\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?\.?\s*(\([^)]*\))?(\s*[~∼-]\s*(\d{4}\s*[.\-/년]\s*)?(\d{1,2}\s*[.\-/월]\s*)?\d{1,2}\s*일?\.?\s*(\([^)]*\))?)?/;
/** "2026.7.22.~8.17.", "7월 22일(수) ~ 8월 17일", "3/3", 엑셀 날짜 숫자(46084)까지. 학년도의 3~12월은 그해, 1~2월은 다음 해. */
export function parseDateRange(value: string, year: number): {from: string; until?: string} | null {
  const text = value.trim();
  if (/^\d{5}$/.test(text)) {const serial = Number(text); if (serial > 40000 && serial < 60000) return {from: new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10)};}
  const match = text.match(/^(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\.?\s*(?:\([^)]*\))?\s*(?:[~∼-]\s*(?:(\d{4})\s*[.\-/년]\s*)?(?:(\d{1,2})\s*[.\-/월]\s*)?(\d{1,2})\s*일?\.?\s*(?:\([^)]*\))?)?/);
  if (!match) return null;
  const make = (y: string | undefined, m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const full = y ? Number(y) : m >= 3 ? year : year + 1, iso = `${full}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
  };
  const from = make(match[1], Number(match[2]), Number(match[3]));
  if (!from) return null;
  // 그룹: 1 시작 연도, 2 시작 월, 3 시작 일, 4 끝 연도, 5 끝 월(없으면 시작 월), 6 끝 일.
  if (!match[6]) return {from};
  const until = make(match[4] ?? match[1], match[5] ? Number(match[5]) : Number(match[2]), Number(match[6]));
  return until ? {from, until} : {from};
}
export function kindOf(name: string): DayKind | null {
  if (/방학(?!식)/.test(name)) return 'vacation';
  if (/재량|휴업/.test(name)) return 'off';
  if (/공휴일|대체|신정|설날|설 연휴|추석|어린이날|현충일|광복절|개천절|한글날|성탄|삼일절|3·1절|노동절|제헌절|선거|부처님/.test(name)) return 'holiday';
  if (/개학|방학식|입학|졸업|종업|시업|운동회|체육대회|체험|수학여행|학예|축제|시험|평가|행사|발표회|소풍|수련/.test(name)) return 'event';
  return null;
}

/** 파일 하나의 모든 표를 읽어 세 가지로 모은다. 어떤 표가 무엇인지 몰라도 셋 다 시도하고, 찾은 것만 남긴다. */
export function interpret(grids: Grid[], plan: Plan): Findings {
  const findings: Findings = {standards: [], templates: [], days: [], notes: []};
  for (const grid of grids) {
    findings.standards.push(...readStandards(grid, plan));
    const template = readTemplate(grid, plan);
    if (template) findings.templates.push(template);
    findings.days.push(...readDays(grid, plan));
  }
  if (!findings.standards.length && !findings.templates.length && !findings.days.length) findings.notes.push('기준시수·시간표·학사일정으로 보이는 표를 찾지 못했어요. 표가 그림으로 들어가 있거나 서식이 특이할 수 있어요.');
  if (findings.standards.some(item => !item.subject)) findings.notes.push('교과 이름이 우리 반 교과와 맞지 않는 줄이 있어요(예: 교과군 합계). 확인 카드에서 골라 주세요.');
  return findings;
}

/** 확인 카드에서 고른 값만 계획에 넣는다. 학교자율시간 줄이 있으면 교과로 더한다. 연간 값만 있으면 두 학기에 나눈다. */
export function applyFindings(plan: Plan, picked: {standards: StandardFinding[]; template: TemplateFinding | null; days: DayFinding[]}): Plan {
  let subjects = plan.subjects.map(subject => ({...subject, standard: {...subject.standard}}));
  for (const item of picked.standards) {
    let key = item.subject;
    if (!key && /학교자율/.test(squash(item.subjectName))) {
      key = 'auto1';
      if (!subjects.some(subject => subject.key === key)) subjects = [...subjects, {key, name: '학교자율시간', short: '자', tone: 'teal', standard: {1: 0, 2: 0}, units: {1: [], 2: []}}];
    }
    const subject = subjects.find(entry => entry.key === key);
    if (!subject) continue;
    if (item.semester) subject.standard[item.semester] = item.hours;
    else {subject.standard[1] = Math.ceil(item.hours / 2); subject.standard[2] = Math.floor(item.hours / 2);}
  }
  let next: Plan = {...plan, subjects};
  if (picked.template) {
    const slots = picked.template.slots.filter(slot => subjects.some(subject => subject.key === slot.subject)).map(({weekday, period, subject}) => ({weekday, period, subject}));
    const semesters: (1 | 2)[] = picked.template.semester ? [picked.template.semester] : [1, 2];
    next = {...next, templates: {...next.templates, ...Object.fromEntries(semesters.map(semester => [semester, slots]))} as Plan['templates']};
  }
  if (picked.days.length) {
    const added = picked.days.flatMap(day => {
      const dates: string[] = [];
      for (let at = day.date; at <= (day.until ?? day.date) && dates.length < 120; at = new Date(Date.parse(`${at}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) if (at >= plan.startsOn && at <= plan.endsOn) dates.push(at);
      return dates.map(date => ({date, kind: day.kind, name: day.name}));
    });
    const replaced = new Set(added.map(day => day.date));
    next = {...next, days: [...next.days.filter(day => !replaced.has(day.date)), ...added].sort((a, b) => a.date.localeCompare(b.date))};
  }
  return next;
}
