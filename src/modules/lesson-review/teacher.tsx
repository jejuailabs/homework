'use client';

import {useCallback, useEffect, useState} from 'react';
import {BarChart3, Eye, EyeOff, FileText, ImagePlus, LoaderCircle, Plus, Send, Sparkles, Trash2, Wand2, X} from 'lucide-react';
import {compressImage, lessonRequest, readPdf} from './client';
import {CONCEPT_MAX, CONCEPT_MIN, QUESTION_MAX, QUESTION_MIN, SUBJECTS} from './engine';
import type {Lesson, LessonConcept, LessonQuestion, QuestionBody, TeacherReport, TeacherState} from './types';
import './styles.css';

type ClassItem = {id: string; name: string};
type Draft = Pick<Lesson, 'subject' | 'unit' | 'title' | 'concepts' | 'questions'> & {id?: string; status: Lesson['status']; source: Lesson['source']};
const blankBody = (): QuestionBody => ({prompt: '', choices: ['', '', '', ''], answer: 0, explanation: ''});
const blankConcept = (index: number): LessonConcept => ({id: `c${index + 1}`, title: '', summary: '', example: ''});
const blankQuestion = (index: number, conceptId = 'c1'): LessonQuestion => ({id: `q${index + 1}`, conceptId, kind: 'choice', ...blankBody(), twin: blankBody()});
const statusLabel = {draft: '초안', published: '배포 중', hidden: '숨김'} as const;

export default function TeacherLessonReview() {
  const [classes, setClasses] = useState<ClassItem[]>([]), [classId, setClassId] = useState(''), [state, setState] = useState<TeacherState | null>(null);
  const [view, setView] = useState<{kind: 'list'} | {kind: 'create'} | {kind: 'edit'; draft: Draft} | {kind: 'report'; lesson: Lesson}>({kind: 'list'});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {fetch('/api/classes', {cache: 'no-store'}).then(response => response.json()).then((data: {classes?: ClassItem[]}) => {setClasses(data.classes || []); setClassId(data.classes?.[0]?.id || '');}).catch(() => setError('학급을 불러오지 못했어요.'));}, []);
  const load = useCallback(async () => {if (!classId) return; try {setState(await lessonRequest<TeacherState>(`teacher?classId=${encodeURIComponent(classId)}`)); setError('');} catch (cause) {setError((cause as Error).message);}}, [classId]);
  useEffect(() => {setView({kind: 'list'}); void load();}, [load]);
  async function toggleRewards() {if (!state) return; setBusy(true); try {await lessonRequest('teacher/settings', {classId, rewardsEnabled: !state.rewardsEnabled}); await load();} catch (cause) {setError((cause as Error).message);} finally {setBusy(false);}}
  const open = (lesson: Lesson) => setView(lesson.status === 'draft' ? {kind: 'edit', draft: {...lesson}} : {kind: 'report', lesson});

  return <div className="lr-page lr-teacher">
    <header className="lr-heading"><div><span className="lr-eyebrow"><Sparkles size={14}/>복습하기</span><h1>오늘 배운 것, 단단하게</h1><p>수업 내용을 넣으면 AI가 개념 카드와 문제 초안을 만들어요. 선생님이 확인하고 배포한 것만 아이들에게 보여요.</p></div><img src="/characters/otter-moa.webp" alt=""/></header>
    <div className="lr-toolbar"><label className="lr-class"><span>우리 반</span><select value={classId} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {state && <label className={`lr-switch ${state.rewardsEnabled ? 'is-on' : ''}`}><input type="checkbox" role="switch" checked={state.rewardsEnabled} disabled={busy} onChange={() => void toggleRewards()}/><span className="lr-switch-track" aria-hidden="true"/><span><strong>완료 보말</strong><small>한 차시를 끝까지 마치면 1개</small></span></label>}
      {view.kind === 'list' && <button type="button" className="button primary" disabled={!classId} onClick={() => setView({kind: 'create'})}><Plus size={16}/>새 복습 만들기</button>}
      {view.kind !== 'list' && <button type="button" className="button" onClick={() => {setView({kind: 'list'}); void load();}}>목록으로</button>}</div>
    {error && <p className="lr-error" role="alert">{error}</p>}
    {view.kind === 'list' && (state ? <LessonList lessons={state.lessons} onOpen={open}/> : <LoaderCircle className="spin"/>)}
    {view.kind === 'create' && state && <CreatePanel classId={classId} aiConfigured={state.aiConfigured} onDraft={draft => setView({kind: 'edit', draft})}/>}
    {view.kind === 'edit' && <Editor key={view.draft.id || 'new'} classId={classId} initial={view.draft} onDone={() => {setView({kind: 'list'}); void load();}}/>}
    {view.kind === 'report' && <Report classId={classId} lesson={view.lesson} onChanged={() => {setView({kind: 'list'}); void load();}}/>}
  </div>;
}

function LessonList({lessons, onOpen}: {lessons: Lesson[]; onOpen: (lesson: Lesson) => void}) {
  if (!lessons.length) return <section className="lr-empty"><h2>아직 만든 복습이 없어요</h2><p>오늘 수업의 교과서 내용, 판서 사진, 학습지 PDF를 넣어 첫 복습을 만들어 보세요.</p></section>;
  return <div className="lr-lesson-grid">{lessons.map(lesson => <button type="button" key={lesson.id} className="lr-lesson-card" onClick={() => onOpen(lesson)}>
    <span className={`lr-chip is-${lesson.status}`}>{statusLabel[lesson.status]}</span><small>{lesson.subject} · {lesson.unit}</small><strong>{lesson.title}</strong>
    <span className="lr-meta">개념 {lesson.concepts.length}개 · 문제 {lesson.questions.length}개{lesson.source === 'ai' ? ' · AI 초안' : ''}</span></button>)}</div>;
}

function CreatePanel({classId, aiConfigured, onDraft}: {classId: string; aiConfigured: boolean; onDraft: (draft: Draft) => void}) {
  const [subject, setSubject] = useState<string>(SUBJECTS[0]), [unit, setUnit] = useState(''), [title, setTitle] = useState(''), [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]), [pdf, setPdf] = useState<{name: string; data: string} | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function addFiles(files: FileList | null) {
    setError('');
    try {for (const file of Array.from(files || [])) {
      if (file.type === 'application/pdf') setPdf({name: file.name, data: await readPdf(file)});
      else if (file.type.startsWith('image/')) {const image = await compressImage(file); setImages(old => old.length >= 4 ? old : [...old, image]);}
    }} catch (cause) {setError((cause as Error).message);}
  }
  async function generate() {
    setBusy(true); setError('');
    try {const data = await lessonRequest<{lesson: Lesson}>('teacher/generate', {classId, subject, unit, title, text, images, pdf}); onDraft({...data.lesson});}
    catch (cause) {setError((cause as Error).message);} finally {setBusy(false);}
  }
  const ready = subject && unit.trim() && title.trim();
  return <section className="lr-card lr-create"><h2><Wand2 size={20}/>오늘 배운 내용 넣기</h2>
    <div className="lr-fields"><label>과목<select value={subject} onChange={event => setSubject(event.target.value)}>{SUBJECTS.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>단원<input value={unit} maxLength={80} onChange={event => setUnit(event.target.value)} placeholder="예: 2. 물의 여행"/></label>
      <label>차시 제목<input value={title} maxLength={80} onChange={event => setTitle(event.target.value)} placeholder="예: 물은 어떻게 순환할까요?"/></label></div>
    <label className="lr-wide">수업 내용<textarea value={text} rows={8} maxLength={20000} onChange={event => setText(event.target.value)} placeholder="교과서 본문, 판서 내용, 핵심 정리를 붙여 넣어 주세요. 사진이나 PDF만 넣어도 돼요."/></label>
    <div className="lr-files"><label className="button"><ImagePlus size={16}/>사진·PDF 넣기<input type="file" accept="image/*,application/pdf" multiple hidden onChange={event => {void addFiles(event.target.files); event.target.value = '';}}/></label><small>사진 4장, PDF 1개(2.5MB)까지. 사진은 자동으로 줄여서 보내요.</small></div>
    {(images.length > 0 || pdf) && <div className="lr-previews">{images.map((image, index) => <span key={index}><img src={image} alt={`넣은 사진 ${index + 1}`}/><button type="button" aria-label="사진 빼기" onClick={() => setImages(old => old.filter((_, at) => at !== index))}><X size={14}/></button></span>)}{pdf && <span className="is-pdf"><FileText size={22}/>{pdf.name}<button type="button" aria-label="PDF 빼기" onClick={() => setPdf(null)}><X size={14}/></button></span>}</div>}
    {error && <p className="lr-error" role="alert">{error}</p>}
    <div className="lr-actions"><button type="button" className="button primary" disabled={busy || !ready || !aiConfigured || (!text.trim() && !images.length && !pdf)} onClick={() => void generate()}>{busy ? <LoaderCircle size={16} className="spin"/> : <Sparkles size={16}/>}{busy ? 'AI가 문제를 만들고 있어요 (최대 1~2분)' : 'AI로 개념·문제 초안 만들기'}</button>
      <button type="button" className="button" disabled={busy || !ready} onClick={() => onDraft({subject, unit, title, status: 'draft', source: 'manual', concepts: Array.from({length: CONCEPT_MIN}, (_, index) => blankConcept(index)), questions: Array.from({length: QUESTION_MIN}, (_, index) => blankQuestion(index))})}>직접 만들기</button></div>
    {!aiConfigured && <p className="lr-note">AI 연결이 설정되지 않아 지금은 직접 만들기만 쓸 수 있어요.</p>}
    <p className="lr-note">AI 초안은 아이들에게 바로 가지 않아요. 내용과 정답을 확인한 뒤 배포해 주세요.</p>
  </section>;
}

function BodyFields({value, kind, onChange, label}: {value: QuestionBody; kind: LessonQuestion['kind']; onChange: (next: QuestionBody) => void; label: string}) {
  const choices = kind === 'ox' ? ['O', 'X'] : value.choices;
  return <div className="lr-body"><label>{label}<textarea rows={2} maxLength={300} value={value.prompt} onChange={event => onChange({...value, prompt: event.target.value})}/></label>
    <div className="lr-choice-edit">{choices.map((choice, index) => <label key={index} className={value.answer === index ? 'is-answer' : ''}><input type="radio" checked={value.answer === index} onChange={() => onChange({...value, answer: index})} aria-label={`${index + 1}번을 정답으로`}/>{kind === 'ox' ? <strong>{choice}</strong> : <input value={choice} maxLength={120} placeholder={`보기 ${index + 1}`} onChange={event => onChange({...value, choices: value.choices.map((item, at) => at === index ? event.target.value : item)})}/>}</label>)}</div>
    <label>해설<textarea rows={2} maxLength={400} value={value.explanation} onChange={event => onChange({...value, explanation: event.target.value})}/></label></div>;
}

function Editor({classId, initial, onDone}: {classId: string; initial: Draft; onDone: () => void}) {
  const [draft, setDraft] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const setConcept = (index: number, next: Partial<LessonConcept>) => setDraft(old => ({...old, concepts: old.concepts.map((item, at) => at === index ? {...item, ...next} : item)}));
  const setQuestion = (index: number, next: Partial<LessonQuestion>) => setDraft(old => ({...old, questions: old.questions.map((item, at) => at === index ? {...item, ...next} : item)}));
  function removeConcept(index: number) {setDraft(old => {const gone = old.concepts[index].id, concepts = old.concepts.filter((_, at) => at !== index); return {...old, concepts, questions: old.questions.map(question => question.conceptId === gone ? {...question, conceptId: concepts[0].id} : question)};});}
  function setKind(index: number, kind: LessonQuestion['kind']) {setQuestion(index, kind === 'ox' ? {kind, choices: ['O', 'X'], answer: 0, twin: {...draft.questions[index].twin, choices: ['O', 'X'], answer: 0}} : {kind, choices: ['', '', '', ''], answer: 0, twin: {...draft.questions[index].twin, choices: ['', '', '', ''], answer: 0}});}
  async function save(publish = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await lessonRequest<{lesson: Lesson}>('teacher/save', {classId, lessonId: draft.id, subject: draft.subject, unit: draft.unit, title: draft.title, concepts: draft.concepts, questions: draft.questions, source: draft.source});
      setDraft(old => ({...old, id: data.lesson.id, concepts: data.lesson.concepts, questions: data.lesson.questions}));
      if (publish) {await lessonRequest('teacher/publish', {classId, lessonId: data.lesson.id}); onDone(); return;}
      setNotice('초안을 저장했어요.');
    } catch (cause) {setError((cause as Error).message);} finally {setBusy(false);}
  }
  async function remove() {if (!draft.id) return onDone(); if (!confirm('이 초안을 지울까요?')) return; setBusy(true); try {await lessonRequest('teacher/delete', {classId, lessonId: draft.id}); onDone();} catch (cause) {setError((cause as Error).message); setBusy(false);}}
  return <section className="lr-editor">
    <div className="lr-card"><h2>{draft.source === 'ai' ? 'AI 초안 확인하기' : '복습 직접 만들기'}</h2><p className="lr-note">개념 카드는 알쏭달쏭·완전모름 문제가 나온 아이에게만 보여요. 쌍둥이 문제는 다시 풀기와 복습 때 번갈아 나와요.</p>
      <div className="lr-fields"><label>과목<select value={draft.subject} onChange={event => setDraft({...draft, subject: event.target.value})}>{[...new Set([...SUBJECTS, draft.subject])].map(value => <option key={value}>{value}</option>)}</select></label><label>단원<input value={draft.unit} maxLength={80} onChange={event => setDraft({...draft, unit: event.target.value})}/></label><label>차시 제목<input value={draft.title} maxLength={80} onChange={event => setDraft({...draft, title: event.target.value})}/></label></div></div>
    <div className="lr-card"><h3>핵심 개념 카드 <small>{draft.concepts.length} / {CONCEPT_MAX}</small></h3>{draft.concepts.map((concept, index) => <div key={concept.id} className="lr-concept-edit"><span className="lr-index">{index + 1}</span><div><input value={concept.title} maxLength={60} placeholder="개념 이름" onChange={event => setConcept(index, {title: event.target.value})}/><textarea rows={3} maxLength={500} value={concept.summary} placeholder="아이 눈높이 설명 (2~4문장)" onChange={event => setConcept(index, {summary: event.target.value})}/><input value={concept.example} maxLength={300} placeholder="예시 (선택)" onChange={event => setConcept(index, {example: event.target.value})}/></div><button type="button" className="lr-icon" aria-label="개념 빼기" disabled={draft.concepts.length <= CONCEPT_MIN} onClick={() => removeConcept(index)}><Trash2 size={16}/></button></div>)}
      <button type="button" className="button" disabled={draft.concepts.length >= CONCEPT_MAX} onClick={() => setDraft(old => ({...old, concepts: [...old.concepts, blankConcept(Math.max(...old.concepts.map(item => Number(item.id.slice(1)) || 0)))]}))}><Plus size={16}/>개념 추가</button></div>
    <div className="lr-card"><h3>문제 <small>{draft.questions.length} / {QUESTION_MAX}</small></h3>{draft.questions.map((question, index) => <details key={question.id} className="lr-question-edit" open={index === 0}><summary><span className="lr-index">{index + 1}</span>{question.prompt || '새 문제'}</summary>
      <div className="lr-fields"><label>연결 개념<select value={question.conceptId} onChange={event => setQuestion(index, {conceptId: event.target.value})}>{draft.concepts.map((concept, at) => <option key={concept.id} value={concept.id}>{at + 1}. {concept.title || '이름 없는 개념'}</option>)}</select></label><label>문제 형식<select value={question.kind} onChange={event => setKind(index, event.target.value as LessonQuestion['kind'])}><option value="choice">4지선다</option><option value="ox">O/X</option></select></label></div>
      <BodyFields label="문제" kind={question.kind} value={question} onChange={next => setQuestion(index, next)}/>
      <div className="lr-twin"><strong>쌍둥이 문제</strong><BodyFields label="같은 개념, 다른 문제" kind={question.kind} value={question.twin} onChange={twin => setQuestion(index, {twin})}/></div>
      <button type="button" className="button" disabled={draft.questions.length <= QUESTION_MIN} onClick={() => setDraft(old => ({...old, questions: old.questions.filter((_, at) => at !== index)}))}><Trash2 size={16}/>이 문제 빼기</button></details>)}
      <button type="button" className="button" disabled={draft.questions.length >= QUESTION_MAX} onClick={() => setDraft(old => ({...old, questions: [...old.questions, blankQuestion(Math.max(...old.questions.map(item => Number(item.id.slice(1)) || 0)), old.concepts[0].id)]}))}><Plus size={16}/>문제 추가</button></div>
    {error && <p className="lr-error" role="alert">{error}</p>}{notice && <p className="lr-notice" role="status">{notice}</p>}
    <div className="lr-actions lr-sticky"><button type="button" className="button" disabled={busy} onClick={() => void save()}>{busy && <LoaderCircle size={16} className="spin"/>}초안 저장</button><button type="button" className="button primary" disabled={busy} onClick={() => void save(true)}><Send size={16}/>확인했어요, 우리 반에 배포</button><button type="button" className="button" disabled={busy} onClick={() => void remove()}><Trash2 size={16}/>초안 지우기</button></div>
  </section>;
}

function Report({classId, lesson, onChanged}: {classId: string; lesson: Lesson; onChanged: () => void}) {
  const [report, setReport] = useState<TeacherReport | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {lessonRequest<TeacherReport>(`teacher/report?classId=${encodeURIComponent(classId)}&lessonId=${encodeURIComponent(lesson.id)}`).then(setReport).catch(cause => setError((cause as Error).message));}, [classId, lesson.id]);
  async function toggle() {setBusy(true); try {await lessonRequest('teacher/hide', {classId, lessonId: lesson.id}); onChanged();} catch (cause) {setError((cause as Error).message); setBusy(false);}}
  const phaseLabel = {new: '시작 전', pretest: '프리테스트', cards: '개념 카드', retest: '다시 풀기', done: '완료'} as const;
  return <section className="lr-report"><div className="lr-card"><span className={`lr-chip is-${lesson.status}`}>{statusLabel[lesson.status]}</span><h2>{lesson.title}</h2><p className="lr-note">{lesson.subject} · {lesson.unit} · 배포한 복습은 고칠 수 없어요. 아이들 기록이 문제와 어긋나지 않게 하기 위해서예요.</p>
    <button type="button" className="button" disabled={busy} onClick={() => void toggle()}>{lesson.status === 'hidden' ? <><Eye size={16}/>다시 보이기</> : <><EyeOff size={16}/>아이들 화면에서 숨기기</>}</button></div>
    {error && <p className="lr-error" role="alert">{error}</p>}{!report ? !error && <LoaderCircle className="spin"/> : <>
      <div className="lr-card"><h3><BarChart3 size={18}/>문제별 이해도</h3><p className="lr-note">완료한 아이는 마지막 체크, 진행 중인 아이는 프리테스트 체크로 셉니다.</p>{report.questions.map((question, index) => {const total = question.know + question.unsure + question.unknown || 1;
        return <div key={question.id} className="lr-stat"><p><span className="lr-index">{index + 1}</span>{question.prompt}<small>첫 시도 정답 {question.correct}/{question.answered}</small></p><div className="lr-bar" aria-label={`완전이해 ${question.know}, 알쏭달쏭 ${question.unsure}, 완전모름 ${question.unknown}`}><span className="is-know" style={{width: `${question.know / total * 100}%`}}/><span className="is-unsure" style={{width: `${question.unsure / total * 100}%`}}/><span className="is-unknown" style={{width: `${question.unknown / total * 100}%`}}/></div><small className="lr-legend">😊 {question.know} · 🤔 {question.unsure} · 😵 {question.unknown}</small></div>;})}</div>
      <div className="lr-card"><h3>아이별 진행</h3><div className="lr-students">{report.students.map(item => <span key={item.id} className={`is-${item.phase}`}>{item.number}. {item.name}<small>{phaseLabel[item.phase]}</small></span>)}</div></div></>}
  </section>;
}
