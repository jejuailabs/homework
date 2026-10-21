'use client';
import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {BookOpen, CalendarDays, ListChecks, RefreshCw, Trophy} from 'lucide-react';
import type {QuizEnglishRange, QuizMode, QuizPack, QuizRange, QuizRank} from './types';
import {ANNUAL_STAGES, MATH_DAYS_PER_STAGE} from './curriculum';
import './styles.css';

type ClassItem = {id: string; name: string; grade?: string | number};
type Progress = {completed: boolean; total: number; finished: number; correct: number};
type Word = {id: string; word: string; meaning: string};
type Day = {date: string; range: QuizRange | null; calendar: {stage: number; cumulative: boolean}};
type Report = {className: string; grade: number; date: string; semester: number; ranking: QuizRank[]; packs: QuizPack[]; students: {id: string; name: string; number: number; points: number; mathStage: number; modes: Partial<Record<QuizMode, Progress>>}[];
  index: {english: {stage: number; words: Word[]}[]; math: {stage: number; labels: string[]}[]}; days: Day[]};
type EnglishChoice = 'default' | 'stages' | 'words';
const MIN_WORDS = 5, MAX_WORDS = 30, stages = Array.from({length: ANNUAL_STAGES}, (_, i) => i);
async function request<T>(url: string, signal?: AbortSignal, body?: object): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', signal, ...(body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '불러오지 못했어요.'); return data;
}
const inEnglishRange = (range: QuizEnglishRange | null | undefined, stage: number, words: Word[]) => !!range && (range.kind === 'stages' ? stage >= range.from && stage <= range.to : words.some(word => range.words.includes(word.id)));
function rangeSummary(day: Day) {
  const english = day.range?.english, math = day.range?.math;
  const calendar = day.calendar.cumulative ? '달력 기본(전체 누적 복습)' : `달력 기본(${day.calendar.stage + 1}단계)`;
  return `영어 ${!english ? calendar : english.kind === 'stages' ? english.from === english.to ? `${english.from + 1}단계` : `${english.from + 1}~${english.to + 1}단계` : `직접 고른 단어 ${english.words.length}개`} · 연산 ${math ? `${math.stage + 1}단계(선생님 지정)` : '개인 진도'}`;
}
function RangePanel({report, classId, onSaved}: {report: Report; classId: string; onSaved: () => void}) {
  const [dayIndex, setDayIndex] = useState(0), day = report.days[dayIndex], isToday = dayIndex === 0;
  const [english, setEnglish] = useState<EnglishChoice>('default'), [from, setFrom] = useState(0), [to, setTo] = useState(0), [words, setWords] = useState<string[]>([]);
  const [mathStage, setMathStage] = useState<number | null>(null), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {
    const range = day.range, base = day.calendar.cumulative ? ANNUAL_STAGES - 1 : day.calendar.stage;
    setEnglish(range?.english?.kind || 'default'); setFrom(range?.english?.kind === 'stages' ? range.english.from : base); setTo(range?.english?.kind === 'stages' ? range.english.to : base);
    setWords(range?.english?.kind === 'words' ? range.english.words : []); setMathStage(range?.math?.stage ?? null); setError(''); setNotice('');
  }, [day]);
  const started = (mode: QuizMode) => report.students.filter(pupil => pupil.modes[mode]).length;
  const wordsValid = english !== 'words' || words.length >= MIN_WORDS && words.length <= MAX_WORDS;
  async function save(reset = false) {
    setSaving(true); setError(''); setNotice('');
    const englishRange: QuizEnglishRange | null = reset || english === 'default' ? null : english === 'stages' ? {kind: 'stages', from, to} : {kind: 'words', words};
    try {await request('/api/daily-quiz/range', undefined, {classId, date: day.date, english: englishRange, math: reset || mathStage === null ? null : {stage: mathStage}}); setNotice(reset ? '기본 출제로 되돌렸어요.' : '범위를 저장했어요.'); onSaved();}
    catch (error) {setError((error as Error).message);} finally {setSaving(false);}
  }
  const toggleWord = (id: string) => setWords(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  return <section className="quiz-card">
    <h3><ListChecks size={19}/>출제 범위 정하기</h3>
    <div className="quiz-range-tabs" role="group" aria-label="날짜 선택">{report.days.map((item, i) => <button key={item.date} type="button" aria-pressed={dayIndex === i} onClick={() => setDayIndex(i)}>{i ? '내일' : '오늘'} · {item.date}</button>)}</div>
    <p className="quiz-help">지금 설정: {rangeSummary(day)}</p>
    {isToday ? <p className="quiz-notice">오늘 이미 시작한 학생(영어 {started('english')}명 · 연산 {started('math')}명)은 기존 문제로 마칩니다. 바꾼 범위는 그 과목을 아직 열지 않은 학생부터 적용돼요.</p> : <p className="quiz-help">내일 범위는 내일 학생이 과목을 열기 전까지 언제든 바꿀 수 있어요.</p>}
    <fieldset className="quiz-range-field" disabled={saving}><legend>영어</legend>
      <label><input type="radio" name="english" checked={english === 'default'} onChange={() => setEnglish('default')}/>달력 기본({day.calendar.cumulative ? '전체 누적 복습' : `${day.calendar.stage + 1}단계`})</label>
      <label><input type="radio" name="english" checked={english === 'stages'} onChange={() => setEnglish('stages')}/>단계 범위</label>
      {english === 'stages' && <div className="quiz-range-row"><label>시작<select value={from} onChange={e => {const value = Number(e.target.value); setFrom(value); if (value > to) setTo(value);}}>{stages.map(stage => <option key={stage} value={stage}>{stage + 1}단계</option>)}</select></label><label>끝<select value={to} onChange={e => {const value = Number(e.target.value); setTo(value); if (value < from) setFrom(value);}}>{stages.map(stage => <option key={stage} value={stage}>{stage + 1}단계</option>)}</select></label><p className="quiz-help">{from === to ? '그 단계의 10단어를 모두 냅니다.' : '끝 단계에서 6문제, 앞 단계들에서 4문제를 날짜마다 돌려 가며 냅니다.'}</p></div>}
      <label><input type="radio" name="english" checked={english === 'words'} onChange={() => setEnglish('words')}/>단어 직접 고르기({MIN_WORDS}~{MAX_WORDS}개)</label>
      {english === 'words' && <div className="quiz-range-words"><p className="quiz-help">{words.length}개 선택 · 10개보다 적으면 고른 단어를 객관식으로 한 번씩 낸 뒤 남은 칸은 쓰기 문제로 채워요.</p>{report.index.english.map(block => <details key={block.stage} open={block.words.some(word => words.includes(word.id))}><summary>{block.stage + 1}단계 ({block.words.filter(word => words.includes(word.id)).length}/{block.words.length})</summary><div className="quiz-word-grid">{block.words.map(word => <label key={word.id}><input type="checkbox" checked={words.includes(word.id)} disabled={!words.includes(word.id) && words.length >= MAX_WORDS} onChange={() => toggleWord(word.id)}/>{word.word} <small>{word.meaning}</small></label>)}</div></details>)}</div>}
    </fieldset>
    <fieldset className="quiz-range-field" disabled={saving}><legend>연산</legend>
      <label><input type="radio" name="math" checked={mathStage === null} onChange={() => setMathStage(null)}/>학생별 개인 진도(기본)</label>
      <label><input type="radio" name="math" checked={mathStage !== null} onChange={() => setMathStage(0)}/>모두 같은 단계로 풀기</label>
      {mathStage !== null && <div className="quiz-range-row"><label>단계<select value={mathStage} onChange={e => setMathStage(Number(e.target.value))}>{report.index.math.map(row => <option key={row.stage} value={row.stage}>{row.stage + 1}단계 · {row.labels.join(', ')}</option>)}</select></label><p className="quiz-help">그날만 선택한 단계 7문제와 바로 앞 단계 3문제로 냅니다. 완료하면 개인 완료 횟수는 평소처럼 1회 늘고, 다음 날부터 다시 개인 진도로 출제됩니다.</p></div>}
    </fieldset>
    {error && <p className="quiz-error" role="alert">{error}</p>}{notice && <p className="quiz-notice" role="status">{notice}</p>}
    <div className="quiz-range-actions"><button className="button" disabled={saving || !wordsValid} onClick={() => void save()}>{isToday ? '오늘' : '내일'} 범위 저장</button><button className="button" disabled={saving || !day.range} onClick={() => void save(true)}>기본으로 되돌리기</button></div>
    <p className="quiz-help">학급 학년을 바꾸면 이전 학년으로 정한 범위는 적용되지 않고 기본 출제로 돌아가요.</p>
  </section>;
}
function QuizIndex({report}: {report: Report}) {
  const [today] = report.days;
  return <div className="quiz-lab-columns">
    <section className="quiz-card"><h3><BookOpen size={19}/>{report.grade}학년 영어 목차 · 12단계</h3><p className="quiz-help">3~11월 학사 달력에 따라 단계마다 10단어씩 열립니다. {today.calendar.cumulative ? '지금은 12월~2월 전체 누적 복습 기간입니다.' : ''}</p>
      {report.index.english.map(block => <details className="quiz-index-stage" key={block.stage}><summary><b>{block.stage + 1}단계</b>{!today.calendar.cumulative && today.calendar.stage === block.stage && <span className="quiz-badge">오늘(달력)</span>}{inEnglishRange(today.range?.english, block.stage, block.words) && <span className="quiz-badge is-teacher">오늘 지정</span>}<small>{block.words.slice(0, 3).map(word => word.word).join(', ')} …</small></summary><ul>{block.words.map(word => <li key={word.id}>{word.word} <span>{word.meaning}</span></li>)}</ul></details>)}
    </section>
    <section className="quiz-card"><h3><BookOpen size={19}/>{report.grade}학년 연산 목차 · 12단계</h3><p className="quiz-help">연산은 달력이 아니라 학생마다 {MATH_DAYS_PER_STAGE}회 완료할 때마다 다음 단계로 갑니다.</p>
      <ol className="quiz-index-math">{report.index.math.map(row => <li key={row.stage}><b>{row.stage + 1}단계</b><span>{row.labels.join(' · ')}</span><small>학생 {report.students.filter(pupil => pupil.mathStage === row.stage + 1).length}명</small>{today.range?.math?.stage === row.stage && <span className="quiz-badge is-teacher">오늘 지정</span>}</li>)}</ol>
    </section>
  </div>;
}
export default function TeacherDailyQuiz() {
  const [classes, setClasses] = useState<ClassItem[]>([]), [classId, setClassId] = useState(''), [grade, setGrade] = useState(3), [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {const controller = new AbortController(); request<{classes: ClassItem[]}>('/api/classes', controller.signal).then(data => {setClasses(data.classes); setClassId(data.classes[0]?.id || '');}).catch(error => {if (!controller.signal.aborted) setError(error.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);}); return () => controller.abort();}, []);
  const load = useCallback(async (signal?: AbortSignal) => {const result = await request<Report>(`/api/daily-quiz/report?classId=${encodeURIComponent(classId)}`, signal); setReport(result);}, [classId]);
  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController(); setLoading(true); setError('');
    const value = Number(classes.find(cls => cls.id === classId)?.grade); setGrade(value >= 1 && value <= 6 ? value : 3);
    void load(controller.signal).catch(error => {if (!controller.signal.aborted) setError(error.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [classId, classes, load, revision]);
  useEffect(() => setReport(null), [classId]);
  async function saveGrade() {
    setSaving(true); setError('');
    try {await request('/api/daily-quiz/grade', undefined, {classId, grade}); setClasses(previous => previous.map(cls => cls.id === classId ? {...cls, grade} : cls));} catch (error) {setError((error as Error).message);} finally {setSaving(false);}
  }
  const mathRange = report?.days[0].range?.math;
  return <section className="quiz-lab">
    <header className="quiz-lab-heading"><div><p className="page-kicker">매일 조금씩, 다시 풀며 단단하게</p><h2>데일리 퀴즈</h2><p>우리 반의 영어·개인 진도 연산과 복습 참여를 확인하세요.</p></div><BookOpen size={34}/></header>
    <section className="quiz-scope"><label>우리 반<select disabled={saving} value={classId} onChange={e => setClassId(e.target.value)}>{classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}</select></label><label>학급 학년<select value={grade} disabled={saving || !classId} onChange={e => setGrade(Number(e.target.value))}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>초등 {value}학년</option>)}</select></label><button className="button" disabled={saving || !classId || Number(classes.find(cls => cls.id === classId)?.grade) === grade} onClick={() => void saveGrade()}>학년 저장</button><button className="button" disabled={loading || saving || !classId} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16}/>새로고침</button></section>
    <p className="quiz-help">학급 학년으로 출제합니다. 연산은 처음 참여한 날짜와 관계없이 1단계에서 시작하고, {MATH_DAYS_PER_STAGE}회 완료마다 다음 단계로 갑니다. 하루 영어 10문제(객관식 8·주관식 2), 연산 10문제이며 과목을 완료하면 5보말을 자동 지급합니다. 개인 복습은 최대 5문제, 문제당 0.5보말입니다. 보말 적립은 자동이며 상점 사용 설정은 기존 보말 메뉴에서 관리합니다. 학년 변경 전에 시작한 오늘의 학습은 기존 학년으로 마무리합니다.</p>
    {error && <p className="quiz-error" role="alert">{error}</p>}{loading && <p role="status">우리 반 학습을 불러오고 있어요.</p>}
    {!loading && !classes.length && !error && <p>먼저 <Link href="/teacher/homework?action=class">학급을 만들어 주세요.</Link></p>}
    {report && <>
      <section className="quiz-card"><h3><CalendarDays size={19}/>{report.date} · {report.className} · {report.grade}학년</h3><p className="quiz-help">연산은 학생별 완료 횟수에 맞춰 12단계를 진행합니다. 영어는 학년별 120개 단어를 반복합니다. 교과서 전체 진도가 아닌 기초 단어와 연산 연습이며, 1·2학년 영어는 선택 체험입니다.</p><div className="quiz-table-wrap"><table className="quiz-report-table"><caption>오늘의 학생별 참여 현황</caption><thead><tr><th scope="col">학생</th><th scope="col">영어</th><th scope="col">연산</th><th scope="col">개인 복습</th><th scope="col">현재 보말</th></tr></thead><tbody>{report.students.map(pupil => <tr key={pupil.id}><th scope="row">{pupil.number}. {pupil.name}</th>{(['english','math','review'] as const).map(mode => {const progress = pupil.modes[mode]; return <td key={mode}>{mode === 'math' && <small>{pupil.mathStage}/12단계 · </small>}{progress ? `${progress.completed ? '완료' : '진행'} ${progress.finished}/${progress.total}${mode !== 'review' ? ` · ${progress.correct}정답` : ''}` : '미참여'}</td>})}<td>{pupil.points.toLocaleString('ko-KR')}</td></tr>)}</tbody></table>{!report.students.length && <p className="quiz-help">등록된 학생이 없어요.</p>}</div></section>
      <RangePanel report={report} classId={classId} onSaved={() => setRevision(value => value + 1)}/>
      <QuizIndex report={report}/>
      <div className="quiz-lab-columns"><section className="quiz-card"><h3><Trophy size={19}/>이번 주 우리 반 랭킹</h3><p className="quiz-help">완료한 데일리의 최초 정답 수입니다. 연산 난이도는 개인 진도에 따라 다를 수 있습니다. 동점은 공동 순위이며 개인 복습과 보말 잔액은 순위에 반영하지 않습니다.</p><ol className="quiz-ranking">{report.ranking.map(row => <li key={row.id}><strong>{row.rank}</strong><span>{row.name}<small>{row.completedDays}일 참여 · {row.completedSubjects}과목 완료</small></span><b>{row.score}점</b></li>)}</ol></section><section className="quiz-card"><h3><BookOpen size={19}/>오늘의 문제 확인</h3><p className="quiz-help">영어는 오늘 우리 반 문제{report.days[0].range?.english ? '(선생님 지정 범위)' : ''}, 연산은 {mathRange ? `선생님이 지정한 ${mathRange.stage + 1}단계` : '1단계'} 예시입니다. {mathRange ? '' : '실제 연산은 학생별 진도에 따라 달라지고, '}개인 복습은 학생별 학습 기록에 따라 달라집니다.</p>{report.packs.map(pack => <details className="quiz-results" key={pack.id}><summary>{pack.subject === 'english' ? '영어' : mathRange ? `연산 ${mathRange.stage + 1}단계 예시` : '연산 1단계 예시'} 10문제와 정답 보기</summary><ol>{pack.questions.map(question => <li key={question.id}><strong>{question.prompt}</strong><span>정답: {question.answer}</span></li>)}</ol></details>)}</section></div>
    </>}
  </section>;
}
