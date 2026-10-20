'use client';
import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {BookOpen, CalendarDays, RefreshCw, Trophy} from 'lucide-react';
import type {QuizMode, QuizPack, QuizRank} from './types';
import {MATH_DAYS_PER_STAGE} from './curriculum';
import './styles.css';

type ClassItem = {id: string; name: string; grade?: string | number};
type Progress = {completed: boolean; total: number; finished: number; correct: number};
type Report = {className: string; grade: number; date: string; semester: number; ranking: QuizRank[]; packs: QuizPack[]; students: {id: string; name: string; number: number; points: number; mathStage: number; modes: Partial<Record<QuizMode, Progress>>}[]};
async function request<T>(url: string, signal?: AbortSignal, body?: object): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', signal, ...(body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '불러오지 못했어요.'); return data;
}
export default function TeacherDailyQuiz() {
  const [classes, setClasses] = useState<ClassItem[]>([]), [classId, setClassId] = useState(''), [grade, setGrade] = useState(3), [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {const controller = new AbortController(); request<{classes: ClassItem[]}>('/api/classes', controller.signal).then(data => {setClasses(data.classes); setClassId(data.classes[0]?.id || '');}).catch(error => {if (!controller.signal.aborted) setError(error.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);}); return () => controller.abort();}, []);
  const load = useCallback(async (signal?: AbortSignal) => {const result = await request<Report>(`/api/daily-quiz/report?classId=${encodeURIComponent(classId)}`, signal); setReport(result);}, [classId]);
  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController(); setLoading(true); setReport(null); setError('');
    const value = Number(classes.find(cls => cls.id === classId)?.grade); setGrade(value >= 1 && value <= 6 ? value : 3);
    void load(controller.signal).catch(error => {if (!controller.signal.aborted) setError(error.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [classId, classes, load, revision]);
  async function saveGrade() {
    setSaving(true); setError('');
    try {await request('/api/daily-quiz/grade', undefined, {classId, grade}); setClasses(previous => previous.map(cls => cls.id === classId ? {...cls, grade} : cls));} catch (error) {setError((error as Error).message);} finally {setSaving(false);}
  }
  return <section className="quiz-lab">
    <header className="quiz-lab-heading"><div><p className="page-kicker">매일 조금씩, 다시 풀며 단단하게</p><h2>데일리 퀴즈</h2><p>우리 반의 영어·개인 진도 연산과 복습 참여를 확인하세요.</p></div><BookOpen size={34}/></header>
    <section className="quiz-scope"><label>우리 반<select disabled={saving} value={classId} onChange={e => setClassId(e.target.value)}>{classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}</select></label><label>학급 학년<select value={grade} disabled={saving || !classId} onChange={e => setGrade(Number(e.target.value))}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>초등 {value}학년</option>)}</select></label><button className="button" disabled={saving || !classId || Number(classes.find(cls => cls.id === classId)?.grade) === grade} onClick={() => void saveGrade()}>학년 저장</button><button className="button" disabled={loading || saving || !classId} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16}/>새로고침</button></section>
    <p className="quiz-help">학급 학년으로 출제합니다. 연산은 처음 참여한 날짜와 관계없이 1단계에서 시작하고, {MATH_DAYS_PER_STAGE}회 완료마다 다음 단계로 갑니다. 하루 영어 10문제(객관식 8·주관식 2), 연산 10문제이며 과목을 완료하면 5보말을 자동 지급합니다. 개인 복습은 최대 5문제, 문제당 0.5보말입니다. 보말 적립은 자동이며 상점 사용 설정은 기존 보말 메뉴에서 관리합니다. 학년 변경 전에 시작한 오늘의 학습은 기존 학년으로 마무리합니다.</p>
    {error && <p className="quiz-error" role="alert">{error}</p>}{loading && <p role="status">우리 반 학습을 불러오고 있어요.</p>}
    {!loading && !classes.length && !error && <p>먼저 <Link href="/teacher/homework?action=class">학급을 만들어 주세요.</Link></p>}
    {report && <>
      <section className="quiz-card"><h3><CalendarDays size={19}/>{report.date} · {report.className} · {report.grade}학년</h3><p className="quiz-help">연산은 학생별 완료 횟수에 맞춰 12단계를 진행합니다. 영어는 학년별 120개 단어를 반복합니다. 교과서 전체 진도가 아닌 기초 단어와 연산 연습이며, 1·2학년 영어는 선택 체험입니다.</p><div className="quiz-table-wrap"><table className="quiz-report-table"><caption>오늘의 학생별 참여 현황</caption><thead><tr><th scope="col">학생</th><th scope="col">영어</th><th scope="col">연산</th><th scope="col">개인 복습</th><th scope="col">현재 보말</th></tr></thead><tbody>{report.students.map(pupil => <tr key={pupil.id}><th scope="row">{pupil.number}. {pupil.name}</th>{(['english','math','review'] as const).map(mode => {const progress = pupil.modes[mode]; return <td key={mode}>{mode === 'math' && <small>{pupil.mathStage}/12단계 · </small>}{progress ? `${progress.completed ? '완료' : '진행'} ${progress.finished}/${progress.total}${mode !== 'review' ? ` · ${progress.correct}정답` : ''}` : '미참여'}</td>})}<td>{pupil.points.toLocaleString('ko-KR')}</td></tr>)}</tbody></table>{!report.students.length && <p className="quiz-help">등록된 학생이 없어요.</p>}</div></section>
      <div className="quiz-lab-columns"><section className="quiz-card"><h3><Trophy size={19}/>이번 주 우리 반 랭킹</h3><p className="quiz-help">완료한 데일리의 최초 정답 수입니다. 연산 난이도는 개인 진도에 따라 다를 수 있습니다. 동점은 공동 순위이며 개인 복습과 보말 잔액은 순위에 반영하지 않습니다.</p><ol className="quiz-ranking">{report.ranking.map(row => <li key={row.id}><strong>{row.rank}</strong><span>{row.name}<small>{row.completedDays}일 참여 · {row.completedSubjects}과목 완료</small></span><b>{row.score}점</b></li>)}</ol></section><section className="quiz-card"><h3><BookOpen size={19}/>오늘의 문제 확인</h3><p className="quiz-help">영어는 오늘의 공통 문제, 연산은 1단계 예시입니다. 실제 연산과 개인 복습은 학생별 학습 기록에 따라 달라집니다.</p>{report.packs.map(pack => <details className="quiz-results" key={pack.id}><summary>{pack.subject === 'english' ? '영어' : '연산 1단계 예시'} 10문제와 정답 보기</summary><ol>{pack.questions.map(question => <li key={question.id}><strong>{question.prompt}</strong><span>정답: {question.answer}</span></li>)}</ol></details>)}</section></div>
    </>}
  </section>;
}
