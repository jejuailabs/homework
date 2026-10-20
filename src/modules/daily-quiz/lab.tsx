'use client';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {BookOpen, Calculator, CalendarDays, Check, ChevronRight, FlaskConical, RefreshCw, RotateCcw, Shell, Trophy} from 'lucide-react';
import {quizModes, understandingLabels, type QuizLabState, type QuizMode, type QuizPack, type QuizPublicSession, type Understanding} from './types';
import {MATH_DAYS_PER_STAGE} from './curriculum';
import QuizStudyDialog from './study-dialog';
import './styles.css';

const subjectName = (mode: QuizMode) => ({english: '오늘의 영어', math: '오늘의 연산', review: '나의 복습'})[mode];
const bomal = (halfUnits: number) => (halfUnits / 2).toLocaleString('ko-KR', {maximumFractionDigits: 1});
async function requestQuiz<T>(path: string, data?: Record<string, unknown>, signal?: AbortSignal, publicMode = false): Promise<T> {
  const response = await fetch(`/api/${publicMode ? 'daily-quiz' : 'admin/daily-quiz'}/${path}`, {cache: 'no-store', signal, ...(data ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)} : {})});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '불러오지 못했어요.'); return result;
}
function localDate() {return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());}
function addDay(date: string, count: number) {const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10);}
export default function DailyQuizLab({revision = 0, publicMode = false}: {revision?: number; publicMode?: boolean}) {
  const [grade, setGrade] = useState(3), [semester, setSemester] = useState(1), [date, setDate] = useState(localDate), [learnerId, setLearnerId] = useState('friend1'), [mode, setMode] = useState<QuizMode>('english');
  const [state, setState] = useState<QuizLabState | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [answer, setAnswer] = useState(''), [preview, setPreview] = useState<QuizPack | null>(null), [studyOpen, setStudyOpen] = useState(false);
  const busyRef = useRef(false), generation = useRef(0), dialog = useRef<HTMLDialogElement>(null);
  const api = useCallback(<T,>(path: string, data?: Record<string, unknown>, signal?: AbortSignal) => requestQuiz<T>(path, data, signal, publicMode), [publicMode]);
  const params = publicMode ? '' : new URLSearchParams({grade: String(grade), semester: String(semester), date, learnerId}).toString();
  const load = useCallback(async (signal?: AbortSignal) => {const current = generation.current, next = await api<QuizLabState>(`state?${params}`, undefined, signal); if (current === generation.current) setState(next);}, [params, api]);
  useEffect(() => {
    const controller = new AbortController(); generation.current++; setLoading(true); setState(null); setError(''); setNotice(''); setAnswer(''); setPreview(null); setStudyOpen(false);
    void load(controller.signal).catch(error => {if (!controller.signal.aborted) setError(error.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => {generation.current++; controller.abort();};
  }, [load, revision]);
  useEffect(() => {if (preview) dialog.current?.showModal();}, [preview]);
  const scope = publicMode ? {grade: state?.grade, semester: state?.semester, date: state?.date} : {grade, semester, date, learnerId};
  const actualGrade = state?.grade || grade;
  const session = state?.sessions[mode], current = session?.questions.find(question => !question.result?.understanding), completed = session?.questions.filter(question => question.result?.understanding).length || 0;
  useEffect(() => {setAnswer('');}, [current?.id, mode]);
  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {await fn();} catch (error) {setError((error as Error).message);} finally {setBusy(false); busyRef.current = false;}
  }
  function updateSession(session: QuizPublicSession) {setState(current => current ? {...current, sessions: {...current.sessions, [session.mode]: session}} : current);}
  function start(target = mode) {void action(async () => {const result = await api<{session: QuizPublicSession}>('start', {...scope, mode: target}); updateSession(result.session); await load();});}
  function openStudy(target: QuizMode) {setMode(target); setAnswer(''); setStudyOpen(true); start(target);}
  function submit(event: FormEvent) {event.preventDefault(); if (!current) return; void action(async () => {const result = await api<{session: QuizPublicSession}>('answer', {...scope, mode, questionId: current.id, answer}); updateSession(result.session);});}
  function understand(understanding: Understanding) {if (!current) return; void action(async () => {
    const result = await api<{session: QuizPublicSession; rewardedHalfUnits: number}>('understanding', {...scope, mode, questionId: current.id, understanding});
    updateSession(result.session);
    if (result.rewardedHalfUnits) setNotice(publicMode ? `보말 ${bomal(result.rewardedHalfUnits)}개를 받았어요!` : `시험용 보말 ${bomal(result.rewardedHalfUnits)}개를 지급했어요.`);
    await load();
  });}
  return <section className="quiz-lab" aria-labelledby="quiz-lab-title">
    {!publicMode && <div className="quiz-lab-banner"><span><FlaskConical size={17}/>관리자 전용 · 비공개 시험</span><strong>AI 호출 0 · 운영 학생과 분리된 보말 장부</strong></div>}
    <header className="quiz-lab-heading"><div><p className="page-kicker">매일 조금씩, 다시 풀며 단단하게</p><h2 id="quiz-lab-title">{publicMode ? '데일리 퀴즈' : '데일리 퀴즈 실험실'}</h2><p>{publicMode ? `${state?.grade || ''}학년 · ${state?.date || ''} · 오늘의 작은 연습을 쌓아 가요.` : '학년별 공통 데일리와 개인 복습을 직접 테스트합니다.'}</p></div><div className="quiz-wallet"><Shell size={24}/><strong>{bomal(state?.walletHalfUnits || 0)}</strong><span>{publicMode ? '내 보말' : '시험용 보말'}</span></div></header>
    {!publicMode && <><div className="quiz-scope"><label>학년<select value={grade} disabled={busy} onChange={e => setGrade(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>초등 {value}학년</option>)}</select></label><label>학기<select value={semester} disabled={busy} onChange={e => setSemester(Number(e.target.value))}><option value={1}>1학기</option><option value={2}>2학기</option></select></label><label>연습 학생<select value={learnerId} disabled={busy} onChange={e => setLearnerId(e.target.value)}>{[1, 2, 3].map(value => <option key={value} value={`friend${value}`}>연습 친구 {value}</option>)}</select></label><label>시험 날짜<input type="date" aria-label="시험 날짜" value={date} min="2000-01-01" max="2099-12-31" disabled={busy} onChange={e => {if (e.target.value) setDate(e.target.value);}}/></label><button className="button" disabled={busy || !date} onClick={() => setDate(addDay(date, 1))}><CalendarDays size={16}/>다음 날 테스트</button><button className="button" disabled={busy} onClick={() => setDate(localDate())}>실제 오늘</button></div>
    <p className="quiz-help">교사는 가입 후 학급을 만들 때 학년을 입력합니다. 정식 학생 메뉴에서는 소속 학급의 학년과 한국 날짜로 출제합니다. 이 화면은 학년·학기를 직접 선택하는 시험 환경입니다.</p></>}
    {actualGrade < 3 && <p className="quiz-help">1·2학년 영어는 정규 교과 진도와 구분한 기초 단어 체험입니다.</p>}
    {error && <p className="quiz-error" role="alert">{error}<button className="button" disabled={busy} onClick={() => void action(load)}>다시 불러오기</button></p>}{notice && <p className="quiz-notice" role="status"><Check size={17}/>{notice}</p>}
    {publicMode && state && <p className="quiz-help">연산은 우리 학년의 처음부터 시작해요. {state.mathProgress?.cumulative ? '지금은 전체 단계를 골고루 복습하고 있어요.' : `나의 연산 ${1 + (state.mathProgress?.stage || 0)}/12단계 · ${MATH_DAYS_PER_STAGE}회 완료할 때마다 다음 단계로 가요.`} 영어는 뜻 고르기 8문제 뒤에 단어 쓰기 2문제가 나와요. 데일리는 과목당 5보말을 받아요.</p>}
    {loading ? <p role="status">학습을 불러오고 있어요.</p> : state && <>
      <nav className="quiz-mode-grid" aria-label="데일리와 복습 선택">{quizModes.map(value => {
        const Icon = value === 'english' ? BookOpen : value === 'math' ? Calculator : RotateCcw, record = state.sessions[value];
        return <button key={value} disabled={busy || (value === 'review' && !state.dueCount && !record)} aria-pressed={mode === value} onClick={() => openStudy(value)}><Icon size={23}/><strong>{subjectName(value)}</strong><span>{value === 'review' ? '개인별 최대 5문제 · 문제당 0.5보말' : value === 'math' ? '내 진도에 맞는 10문제 · 완료 시 5보말' : '함께 푸는 10문제 · 완료 시 5보말'}</span><small>{record?.completed ? '완료했어요' : record ? `${record.questions.filter(question => question.result?.understanding).length}/${record.questions.length} 진행 중` : value === 'review' ? `예정된 복습 ${state.dueCount}개` : '도전할 준비가 됐어요'}</small></button>;
      })}</nav>
      <div className="quiz-lab-columns"><section className="quiz-play" aria-labelledby="quiz-play-title"><div className="quiz-play-head"><h3 id="quiz-play-title">{subjectName(mode)}</h3>{session && <span>{completed}/{session.questions.length}</span>}</div>
        <div className="quiz-start quiz-adventure-start"><img src={`/characters/${mode === 'math' ? 'hamster-kong' : mode === 'review' ? 'otter-moa' : 'rabbit-tori'}.webp`} alt="함께 도전할 친구" width="115" height="115"/><h3>{session?.completed ? '오늘의 도전을 끝냈어요!' : session ? '친구와 함께 이어서 풀어요' : '작은 도전, 함께 떠나 볼까요?'}</h3><p>{mode === 'math' ? '우리 학년의 기초부터 차근차근, 내 속도로 풀어요.' : mode === 'english' ? '뜻 고르기 8문제를 풀고 마지막에 단어 2개를 써요.' : '이전에 배운 내용을 다시 만나 더 단단하게 만들어요.'}</p><button className="button primary" disabled={busy || (mode === 'review' && !state.dueCount && !session)} onClick={() => openStudy(mode)}>{session?.completed ? '완료한 여행 보기' : session ? '이어서 풀기' : '친구와 시작하기'}<ChevronRight size={17}/></button>{mode === 'review' && !state.dueCount && !session && <p className="quiz-help">데일리를 풀고 다음 복습일에 다시 만나요.</p>}</div>
        {session && !!completed && <details className="quiz-results"><summary>완료한 문제와 복습 분기 {completed}개 보기</summary><ul>{session.questions.filter(question => question.result?.understanding).map(question => <li key={question.id}><strong>{question.prompt}</strong><span>{question.result!.correct ? '정답' : '오답'} · {understandingLabels[question.result!.understanding!]} · 다음 복습 {question.result!.nextDue}</span></li>)}</ul></details>}
      </section>
      <aside className="quiz-side"><section className="quiz-card"><h3><Trophy size={19}/>이번 주 데일리 랭킹</h3><p className="quiz-help">{state.weekStart} 시작 · {publicMode ? '우리 반 친구들과 함께해요.' : '연습 친구 3명.'} 완료한 데일리의 최초 정답만 계산하며, 복습과 보말 잔액은 제외합니다. 동점은 공동 순위예요.</p><ol className="quiz-ranking">{state.ranking.map(row => <li key={row.id} className={row.id === (publicMode ? state.learnerId : learnerId) ? 'is-current' : ''}><strong>{row.rank}</strong><span>{row.name}<small>{row.completedDays}일 참여 · {row.completedSubjects}과목 완료</small></span><b>{row.score}점</b></li>)}</ol></section><section className="quiz-card"><h3><Shell size={19}/>{publicMode ? '퀴즈 보말 내역' : '시험용 보말 내역'}</h3><p className="quiz-help">{publicMode ? '퀴즈로 받은 보말이에요. 상점에서 사용한 뒤의 현재 잔액은 위에서 확인하세요.' : '시험용 보말은 운영 학생 기록과 분리됩니다.'}</p>{!state.ledger.length ? <p className="quiz-help">아직 지급 내역이 없어요.</p> : <ul className="quiz-ledger">{state.ledger.map(row => <li key={row.id}><span>{row.reason}<small>{row.date} · 잔액 {bomal(row.balanceHalfUnits)}</small></span><strong>+{bomal(row.halfUnits)}</strong></li>)}</ul>}</section></aside></div>
      {!publicMode && <section className="quiz-card quiz-preparation"><div className="quiz-section-head"><div><h3><CalendarDays size={19}/>공통 문제 준비</h3><p className="quiz-help">한국 시간 매일 오후 8시 예약 · 다음 날부터 7일치 확보. 한 번 저장한 문제는 덮어쓰지 않습니다.</p></div><button className="button" disabled={busy} onClick={() => void action(async () => {const result = await api<{created: number; existing: number}>('prepare', scope); await load(); setNotice(`선택 날짜부터 7일치를 준비했어요. 새 묶음 ${result.created}개 · 기존 묶음 ${result.existing}개 보존`);})}><RefreshCw size={16}/>선택 학년 7일치 준비</button></div><p className="quiz-help">예약 인증: {state.schedulerConfigured ? '설정됨' : '환경변수 설정 필요'} · 최근 준비: {state.lastPreparation ? `${new Date(state.lastPreparation.at).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})} (${state.lastPreparation.source.startsWith('admin:') ? '관리자 실행' : '예약 실행'})` : '아직 없음'}</p><div className="quiz-pack-days">{state.prepared.map(day => <div key={day.date}><strong>{day.date}</strong>{(['english', 'math'] as const).map(subject => <button key={subject} disabled={busy} onClick={() => void action(async () => {const result = await api<{pack: QuizPack}>(`preview?${new URLSearchParams({grade: String(grade), semester: String(semester), date: day.date, mode: subject})}`); setPreview(result.pack);})}>{subject === 'english' ? '영어' : '연산'} {day[subject] ? '준비됨' : '미저장'} · 검수</button>)}</div>)}</div><p className="quiz-help">단어장은 학년별 120개, 총 720개입니다. 3~11월 완만한 12단계 전개와 12~2월 누적 복습으로 구성하며, 정식 학생 연산은 달력과 관계없이 개인별 완료 횟수에 따라 첫 단계부터 시작합니다. 교과서 전체를 다루지는 않습니다.</p></section>}
      <section className="quiz-card"><h3><RotateCcw size={19}/>개인 복습 일정</h3>{!state.skills.length ? <p className="quiz-help">답안과 이해도를 저장하면 복습 일정이 생겨요.</p> : <div className="quiz-skills">{state.skills.map(skill => <div key={skill.id}><strong>{skill.label}</strong><span>{skill.dueDate} · {skill.interval}일 간격</span><small>{skill.attempts}회 확인 · {skill.lastDate}</small></div>)}</div>}</section>
    </>}
    {studyOpen && <QuizStudyDialog mode={mode} session={session} grade={actualGrade} answer={answer} busy={busy} error={error} notice={notice} onAnswer={setAnswer} onSubmit={submit} onUnderstand={understand} onClose={() => setStudyOpen(false)}/>}
    {preview && <dialog ref={dialog} className="quiz-preview" aria-labelledby="quiz-preview-title" onCancel={() => setPreview(null)}><div className="quiz-section-head"><h3 id="quiz-preview-title">관리자 정답 검수 · {preview.grade}학년 {preview.semester}학기</h3><button className="button" onClick={() => setPreview(null)}>닫기</button></div><p>{preview.date} · {subjectName(preview.subject)} · {preview.version}</p><ol>{preview.questions.map(question => <li key={question.id}><strong>{question.prompt}</strong><p>정답: {question.answer}</p><small>{question.explanation}</small></li>)}</ol></dialog>}
  </section>;
}
