import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/server/admin';
import {contextForUid, runAsTeacher, type Context} from '@/lib/server/auth';
import {handle} from '@/lib/server/api';
import {handleAssignmentVisibility} from '@/lib/server/assignment-visibility';
import {handleExhibitions} from '@/lib/server/exhibitions';
import {handleParticipation} from '@/lib/server/participation';
import {handlePoints} from '@/lib/server/points';
import {handleCards} from '@/lib/server/cards';
import {cardDistributionSettings} from './card-settings';
import {classDefaultsFor} from '@/lib/server/cards-class-settings';
import {cardSetDraftInput, reviewDraftInput, setDraftPreview} from './card-drafts';
import {draftCardsFor} from '@/lib/server/cards-ai';
import {cardReviewCandidates} from '@/lib/cards-summary';
import {handleLearningLinks} from '@/lib/server/learning-links';
import {handleCanvases} from '@/lib/server/canvases';
import {handlePublicQuiz} from '@/modules/daily-quiz/public-server';
import {handleLessonReview} from '@/modules/lesson-review/server';
import {handlePlayground} from '@/modules/playground/server';
import {handleWorkspace} from '@/modules/teacher-workspace/server';
import {seoulDate} from '@/modules/teacher-workspace/policy';
import {assignmentSubmissionType, submissionTypes} from '@/lib/assignment-submission';
import {BerryError, alias, safeId} from './policy';
import type {BearerContext, McpTool} from './types';

/**
 * Berry's manage_* tools: every teacher action a menu offers, said in words. A call only plans: it checks ownership,
 * reads the current values and returns a before → after card. The save runs the app's own route handlers in-process
 * as the teacher (runAsTeacher), so validation, ownership, idempotency and side effects are exactly the screen's.
 */
type Data = Record<string, any>;
type Route = 'api' | 'visibility' | 'exhibitions' | 'boards' | 'quiz' | 'review' | 'playground' | 'points' | 'cards' | 'links' | 'canvases' | 'workspace';
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** chain 'setId': this call needs the set the previous call saved (its id and version go into the body); it is skipped when that call failed. */
export type ManageCall = {route: Route; segments: string[]; method: Method; body?: unknown; query?: string; label?: string; chain?: 'setId'};
export type ManagePlan = {view: Data; calls: ManageCall[]; savedNote: string};

const ROUTES: Record<Route, (request: Request, segments: string[]) => Promise<Response>> = {
  api: (request, segments) => handle(request, segments[0], segments[1], segments[2]),
  visibility: request => handleAssignmentVisibility(request),
  exhibitions: handleExhibitions, boards: handleParticipation, quiz: handlePublicQuiz, review: handleLessonReview, playground: handlePlayground,
  points: handlePoints, cards: handleCards, links: handleLearningLinks, canvases: handleCanvases, workspace: handleWorkspace,
};
const ORIGIN = 'http://berry.internal';

/** Runs one of the app's own handlers as this teacher. The Request object is the only key to the bound context. */
async function run(call: ManageCall, teacher: Context): Promise<{status: number; data: Data}> {
  const url = `${ORIGIN}/api/${call.route}/${call.segments.map(encodeURIComponent).join('/')}${call.query ? `?${call.query}` : ''}`;
  const request = new Request(url, {method: call.method, headers: {'content-type': 'application/json', origin: ORIGIN}, ...(call.body === undefined || call.method === 'GET' ? {} : {body: JSON.stringify(call.body)})});
  const response = await runAsTeacher(request, teacher, () => ROUTES[call.route](request, call.segments));
  return {status: response.status, data: await response.json().catch(() => ({}))};
}
async function read(call: Omit<ManageCall, 'method'>, teacher: Context) {
  const result = await run({...call, method: 'GET'}, teacher);
  if (result.status >= 400) throw new BerryError(String(result.data.error ?? '지금 값을 읽지 못했어요.'), result.status === 404 ? 404 : 400, result.status === 404 ? 'not_found' : 'invalid_request');
  return result.data;
}

// ---- Shared lookups (ownership is checked here for the preview and again by the handler at save time) ----
async function owned(path: string, uid: string, label: string): Promise<Data> {
  const data = (await db().doc(path).get()).data();
  if (!data || data.ownerUid !== uid) throw new BerryError(`이 ${label}을(를) 찾을 수 없어요.`, 404, 'not_found');
  return data;
}
async function ownedClass(uid: string, classId: unknown): Promise<Data & {id: string}> {
  const id = safeId(classId, '학급');
  return {id, ...(await owned(`classes/${id}`, uid, '학급'))};
}
async function studentsByNumber(classId: string, numbers: unknown) {
  if (!Array.isArray(numbers) || !numbers.length) throw new BerryError('학생 번호(student_numbers)를 알려 주세요.');
  const roster = (await db().collection(`classes/${classId}/students`).select('number', 'disabled').get()).docs.filter(doc => !doc.data().disabled);
  return [...new Set(numbers.slice(0, 100))].map(number => {
    const found = roster.filter(doc => Number(doc.data().number) === Number(number));
    if (found.length !== 1) throw new BerryError(`${alias(Number(number) || 0)}을(를) 명단에서 찾지 못했어요.`, 404, 'not_found');
    return {id: found[0].id, number: Number(number), label: alias(Number(number))};
  });
}
async function activeStudents(classId: string) {
  return (await db().collection(`classes/${classId}/students`).select('number', 'disabled').get()).docs.filter(doc => !doc.data().disabled).map(doc => ({id: doc.id, number: Number(doc.data().number) || 0}));
}
const onOff = (value: unknown) => value === true ? '켜짐' : value === false ? '꺼짐' : '-';
const shown = (value: unknown) => value === undefined || value === null || value === '' ? '없음' : Array.isArray(value) ? value.join(', ') || '없음' : typeof value === 'boolean' ? onOff(value) : String(value);
const change = (label: string, before: unknown, after: unknown) => `${label}: ${shown(before)} → ${shown(after)}`;
const bool = (value: unknown, name: string) => {if (value !== undefined && typeof value !== 'boolean') throw new BerryError(`${name}은(는) true/false로 보내 주세요.`); return value as boolean | undefined;};
const pick = <T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined => {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new BerryError(`${name}은(는) ${allowed.join('·')} 중 하나예요.`);
  return value as T;
};
function day(value: unknown, name = 'date') {
  const text = String(value ?? '').trim(), today = seoulDate(Date.now());
  if (text === 'today' || text === '오늘') return today;
  if (text === 'tomorrow' || text === '내일') return seoulDate(Date.now() + 86_400_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw new BerryError(`${name}은(는) YYYY-MM-DD로 보내 주세요.`);
  return text;
}
/** "YYYY-MM-DD HH:mm" (Seoul) → ISO; a bare date is 23:59 that day. */
function instant(value: unknown, name: string) {
  const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value.trim()) : null;
  if (!match) throw new BerryError(`${name}은(는) YYYY-MM-DD HH:mm으로 보내 주세요.`);
  const ms = Date.parse(`${match[1]}T${match[2] ?? '23'}:${match[3] ?? '59'}:00+09:00`);
  if (!Number.isFinite(ms)) throw new BerryError(`${name}을(를) 확인해 주세요.`);
  return new Date(ms).toISOString();
}
const clock = (iso: unknown) => {const ms = typeof iso === 'string' ? Date.parse(iso) : NaN; if (!Number.isFinite(ms)) return null; const d = new Date(ms + 9 * 3_600_000); return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;};
const TYPE_LABELS: Record<string, string> = {text: '글', image: '사진', video: '동영상', audio: '녹음', legacy: '자유(예전 방식)'}, typeLabel = (type: string) => TYPE_LABELS[type] ?? type;
const STUDENT = '저장하면 학생 화면에 바로 보여요.', PUBLIC = '외부 공개 링크로 누구나 볼 수 있게 돼요.';

const str = {type: 'string'}, boolSchema = {type: 'boolean'}, nums = {type: 'array', items: {type: 'integer', minimum: 1, maximum: 999}, maxItems: 100};
const cardDirection = {type: 'string', enum: ['front-back', 'back-front']};
const cardMode = {type: 'object', properties: {count: {type: 'integer', minimum: 0, description: '필수 학습량. 0이면 선택 학습, 생략하면 범위 카드 수만큼'}, range_start: {type: 'integer', minimum: 1}, range_end: {type: 'integer', minimum: 1}, direction: cardDirection}, additionalProperties: false};
const PLAN_NOTE = '저장하지 않고 확인 카드를 만듭니다. 선생님이 카드에서 [저장]을 눌러야 반영됩니다.';
export const MANAGE_TOOLS: McpTool[] = [
  {name: 'manage_homework', scope: 'classroom:write', description: `숙제 고치기·숨기기·검사. action: edit(숙제 수정 화면과 같은 항목: title·description·due_at("none"이면 마감 없앰)·submission_type(text 글·image 사진·video 동영상·audio 녹음, 제출한 학생이 아직 없을 때만 바뀜)·sync_exhibition·sync_board(전시실·참여보드 자동 연동 켜기/끄기, 글·녹음 숙제는 전시실 연동 불가). 바꿀 것만 보내면 나머지는 그대로), hide, restore, review(student_numbers의 제출을 status done|revision으로, feedback 선택), review_all(제출하고 검사 안 한 학생 모두 검사 완료, 1명당 보말 지급). assignment_id는 list_assignments에서 확인. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['edit', 'hide', 'restore', 'review', 'review_all']}, assignment_id: str, title: {type: 'string', maxLength: 120}, description: {type: 'string', maxLength: 5000}, due_at: {type: 'string', description: 'YYYY-MM-DD HH:mm (Asia/Seoul) 또는 none'}, submission_type: {type: 'string', enum: ['text', 'image', 'video', 'audio']}, sync_exhibition: boolSchema, sync_board: boolSchema, student_numbers: nums, status: {type: 'string', enum: ['done', 'revision']}, feedback: {type: 'string', maxLength: 1000}}, required: ['action', 'assignment_id'], additionalProperties: false}},
  {name: 'manage_exhibition', scope: 'classroom:write', description: `전시실 설정·작품 관리. action: update(title, description, tags, status draft|open|closed, theme cozy(아늑한)|forest(숲)|sky(하늘)|ocean(바다)|earth(우주·지구 궤도 3D)|moon(우주·달 분화구 3D)|saturn(우주·토성 고리 3D), comments, student_uploads, qr_public, docent, docent_public_audio, guestbook, artbook 중 바꿀 것만), edit_artwork(artwork_id와 artwork_title·artwork_description·artwork_date·artwork_status approved|revision·feedback), set_dates(date, artwork_ids 비우면 전체), delete(위험). 전시실의 "배경"은 theme입니다. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['update', 'edit_artwork', 'set_dates', 'delete']}, exhibition_id: str, title: {type: 'string', maxLength: 120}, description: {type: 'string', maxLength: 2000}, tags: {type: 'array', items: {type: 'string', maxLength: 20}, maxItems: 10}, status: {type: 'string', enum: ['draft', 'open', 'closed']}, theme: {type: 'string', enum: ['cozy', 'forest', 'sky', 'ocean', 'earth', 'moon', 'saturn']}, comments: boolSchema, student_uploads: boolSchema, qr_public: boolSchema, docent: boolSchema, docent_public_audio: boolSchema, guestbook: boolSchema, artbook: boolSchema, artwork_id: str, artwork_title: {type: 'string', maxLength: 120}, artwork_description: {type: 'string', maxLength: 2000}, artwork_date: {type: 'string', description: 'YYYY-MM-DD'}, artwork_status: {type: 'string', enum: ['approved', 'revision']}, feedback: {type: 'string', maxLength: 1000}, date: {type: 'string', description: 'YYYY-MM-DD'}, artwork_ids: {type: 'array', items: str, maxItems: 300}}, required: ['action', 'exhibition_id'], additionalProperties: false}},
  {name: 'manage_board', scope: 'classroom:write', description: `참여보드 설정·글 관리. action: update(title, description, layout wall|columns|grid|table|freeform|rows|timeline|stream|map, theme peach|mint|lavender|sky|lemon|rose, status open|frozen(잠금), sort manual|newest|oldest, comments, reactions, moderation(승인제), anonymous, public_view, visitor_comments 중 바꿀 것만), post(선생님 글: post_title·text·link), hide_post·show_post·pin_post·unpin_post·delete_post(post_id), share_link, rotate_link(위험), archive. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['update', 'post', 'hide_post', 'show_post', 'pin_post', 'unpin_post', 'delete_post', 'share_link', 'rotate_link', 'archive']}, board_id: str, title: {type: 'string', maxLength: 120}, description: {type: 'string', maxLength: 2000}, layout: {type: 'string', enum: ['wall', 'columns', 'grid', 'table', 'freeform', 'rows', 'timeline', 'stream', 'map']}, theme: {type: 'string', enum: ['peach', 'mint', 'lavender', 'sky', 'lemon', 'rose']}, status: {type: 'string', enum: ['open', 'frozen']}, sort: {type: 'string', enum: ['manual', 'newest', 'oldest']}, comments: boolSchema, reactions: boolSchema, moderation: boolSchema, anonymous: boolSchema, public_view: boolSchema, visitor_comments: boolSchema, post_id: str, post_title: {type: 'string', maxLength: 200}, text: {type: 'string', maxLength: 10000}, link: {type: 'string', maxLength: 2000}}, required: ['action', 'board_id'], additionalProperties: false}},
  {name: 'manage_quiz', scope: 'classroom:write', description: `매일 퀴즈 범위와 학년. action: set_range(date today|tomorrow 또는 YYYY-MM-DD, english_from·english_to 영어 단계 0~11, math_stage 수학 단계 0~11), clear_range(date), set_grade(grade 1~6, 위험: 반 전체 퀴즈가 바뀜). ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['set_range', 'clear_range', 'set_grade']}, class_id: str, date: str, english_from: {type: 'integer', minimum: 0, maximum: 11}, english_to: {type: 'integer', minimum: 0, maximum: 11}, math_stage: {type: 'integer', minimum: 0, maximum: 11}, grade: {type: 'integer', minimum: 1, maximum: 6}}, required: ['action', 'class_id'], additionalProperties: false}},
  {name: 'manage_review', scope: 'classroom:write', description: `복습하기 관리. action: hide, show(숨긴 복습 다시 보이기), delete_draft(초안 삭제, 위험), rewards_on, rewards_off(복습 보상). lesson_id는 get_review_status에서 확인. 배포는 publish_review. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['hide', 'show', 'delete_draft', 'rewards_on', 'rewards_off']}, class_id: str, lesson_id: str}, required: ['action', 'class_id'], additionalProperties: false}},
  {name: 'manage_playground', scope: 'classroom:write', description: `말놀이터 설정과 반 문제. action: settings(enabled, duels, rankings, rewards, solo_reward 0~3, duel_reward 0~3 중 바꿀 것만), add_item(kind nonsense|riddle|vocab|spelling, prompt, answers, reveal 풀이, choices·hints 선택, grade_band low|mid|high). ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['settings', 'add_item']}, class_id: str, enabled: boolSchema, duels: boolSchema, rankings: boolSchema, rewards: boolSchema, solo_reward: {type: 'integer', minimum: 0, maximum: 3}, duel_reward: {type: 'integer', minimum: 0, maximum: 3}, kind: {type: 'string', enum: ['nonsense', 'riddle', 'vocab', 'spelling']}, prompt: {type: 'string', maxLength: 600}, answers: {type: 'array', items: {type: 'string', maxLength: 120}, maxItems: 8}, choices: {type: 'array', items: {type: 'string', maxLength: 120}, maxItems: 4}, hints: {type: 'array', items: {type: 'string', maxLength: 300}, maxItems: 3}, reveal: {type: 'string', maxLength: 1200}, grade_band: {type: 'string', enum: ['low', 'mid', 'high']}}, required: ['action', 'class_id'], additionalProperties: false}},
  {name: 'manage_points', scope: 'classroom:write', description: `보말 주기·빼기·설정. action: grant(student_numbers 또는 all_students, amount, reason 필수), revoke(위험, 같은 입력), settings(enabled, label, homework_points). ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['grant', 'revoke', 'settings']}, class_id: str, student_numbers: nums, all_students: boolSchema, amount: {type: 'integer', minimum: 1, maximum: 1000}, reason: {type: 'string', maxLength: 200}, enabled: boolSchema, label: {type: 'string', maxLength: 16}, homework_points: {type: 'integer', minimum: 0, maximum: 1000}}, required: ['action', 'class_id'], additionalProperties: false}},
  {name: 'manage_cards', scope: 'classroom:write', description: `카드놀이 세트 만들기·배부. action: create_set(set_title과 source로 AI 초안 세트 만들기. source: words=영어 단어 목록 words, topic=영어 주제 topic, passage=영어 본문 text에서 뽑기, concept=교과 개념어·한자(subject와 topic 또는 교과서 text). level·count 선택. class_id를 주면 저장 직후 그 반에 배부), create_review_set(distribution_id의 많이 틀린 카드로 복습 세트. count 기본 10, rewrite_examples 기본 true면 단어 세트 예문만 AI로 새로 씀. class_id를 주면 바로 배부), distribute(set_title 또는 set_id를 class_id에 배부), stop·resume(distribution_id, list_card_sets의 id). 만든 세트는 미리보기에 카드가 보이고, 선생님이 저장해야 생긴다. 배부 때 말하지 않은 값은 그 반의 '우리 반 학습 기본값'(저장했으면), 아니면 앱 기본값(암기·리콜은 카드 수만큼 필수, 스펠은 선택, 테스트는 최대 20문항·목표 80점·3회·직접 쓰기·시간 제한 없음, 마감 후에는 열어 두고 지각 표시)을 쓴다. 선택 학습을 원하면 required_modes에서 모드마다 count 0을 보낸다. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['create_set', 'create_review_set', 'distribute', 'stop', 'resume']}, class_id: str, set_id: str, set_title: {type: 'string', maxLength: 120}, distribution_id: str, source: {type: 'string', enum: ['words', 'topic', 'passage', 'concept'], description: 'create_set 재료'}, words: {type: 'array', items: {type: 'string', maxLength: 80}, maxItems: 60, description: 'source=words: 영어 단어·숙어'}, topic: {type: 'string', maxLength: 100, description: 'source=topic·concept: 주제나 단원'}, text: {type: 'string', maxLength: 8000, description: 'source=passage: 영어 본문, concept: 교과서 내용(선택)'}, subject: {type: 'string', enum: ['korean', 'math', 'social', 'science', 'hanja', 'other'], description: 'source=concept 과목'}, level: {type: 'string', enum: ['elementary', 'middle', 'high'], description: '수준. 없으면 elementary'}, count: {type: 'integer', minimum: 1, maximum: 30, description: '카드 수(topic·passage·concept 기본 15, 복습 기본 10)'}, rewrite_examples: {type: 'boolean', description: 'create_review_set: 예문을 AI로 새로 쓰기'}, due_at: {type: 'string', description: 'YYYY-MM-DD HH:mm (Asia/Seoul)'}, required_modes: {type: 'object', description: '모드별 필수 학습. 없는 모드는 기본값', properties: {memorize: cardMode, recall: cardMode, spell: cardMode}, additionalProperties: false}, test: {type: 'object', properties: {question_count: {type: 'integer', minimum: 1}, goal_score: {type: 'integer', minimum: 0, maximum: 100}, max_attempts: {type: 'integer', minimum: 1, maximum: 20}, require_study: {type: 'boolean', description: '필수 학습을 마쳐야 테스트 열기'}, direction: cardDirection, answer_release: {type: 'string', enum: ['immediate', 'after-due', 'never'], description: '정답 공개 시점. after-due는 due_at 필요'}, format: {type: 'string', enum: ['written', 'choice'], description: '문제 형식. written은 직접 쓰기, choice는 객관식'}, time_limit_seconds: {type: 'integer', minimum: 60, maximum: 7200, description: '테스트 제한 시간(초). 없으면 제한 없음'}}, additionalProperties: false}, after_due: {type: 'string', enum: ['open', 'late', 'lock'], description: '마감 후 처리. open은 계속 열어 두기, late는 열어 두고 지각 표시, lock은 학습과 새 테스트 닫기. due_at 필요'}}, required: ['action'], additionalProperties: false}},
  {name: 'manage_class_tools', scope: 'classroom:write', description: `투표·캔버스. action: create_poll(class_id, title, options 2~50, closes_at·hide_names·show_results live|closed 선택), close_poll·reopen_poll(poll_id), create_canvas(class_id, title, mission), freeze_canvas·open_canvas·archive_canvas(canvas_id). id는 list_class_tools에서 확인. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['create_poll', 'close_poll', 'reopen_poll', 'create_canvas', 'freeze_canvas', 'open_canvas', 'archive_canvas']}, class_id: str, title: {type: 'string', maxLength: 160}, options: {type: 'array', items: {type: 'string', maxLength: 200}, maxItems: 50}, closes_at: {type: 'string', description: 'YYYY-MM-DD HH:mm (Asia/Seoul)'}, hide_names: boolSchema, show_results: {type: 'string', enum: ['live', 'closed']}, poll_id: str, mission: {type: 'string', maxLength: 600}, canvas_id: str}, required: ['action'], additionalProperties: false}},
  {name: 'manage_class', scope: 'classroom:write', description: `학급·명단. action: create_class(name, grade, year), add_students(class_id, students [{number, name}]), reset_code(class_id, student_number, 위험: 그 학생은 새 코드로 다시 로그인). 입장 코드는 채팅에 보이지 않고 학급 명단 화면에서 확인합니다. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['create_class', 'add_students', 'reset_code']}, class_id: str, name: {type: 'string', maxLength: 80}, grade: {type: 'integer', minimum: 1, maximum: 6}, year: {type: 'integer', minimum: 2020, maximum: 2100}, students: {type: 'array', maxItems: 100, items: {type: 'object', properties: {number: {type: 'integer', minimum: 1, maximum: 999}, name: {type: 'string', maxLength: 50}}, required: ['number', 'name'], additionalProperties: false}}, student_number: {type: 'integer', minimum: 1, maximum: 999}}, required: ['action'], additionalProperties: false}},
  {name: 'manage_workspace', scope: 'workspace:write', description: `업무 공간 고치기·지우기. action: edit_event(event_id와 title·start·end·all_day 중 바꿀 것), delete_event(위험), edit_item(item_id와 title·body·due_at·tags), delete_item(위험), delete_folder(빈 폴더만, 위험), save_timetable(week_key YYYY-Www, timetable_text "월1 국어, 월2 수학" 형식으로 그 주 전체를 바꿈). id는 get_calendar·search_workspace에서 확인. 민감 항목은 고칠 수 없습니다. ${PLAN_NOTE}`, inputSchema: {type: 'object', properties: {action: {type: 'string', enum: ['edit_event', 'delete_event', 'edit_item', 'delete_item', 'delete_folder', 'save_timetable']}, event_id: str, item_id: str, folder_id: str, title: {type: 'string', maxLength: 120}, start: {type: 'string', description: 'YYYY-MM-DD 또는 YYYY-MM-DD HH:mm'}, end: {type: 'string', description: 'YYYY-MM-DD 또는 YYYY-MM-DD HH:mm, none이면 없앰'}, all_day: boolSchema, body: {type: 'string', maxLength: 8000}, due_at: {type: 'string', description: 'YYYY-MM-DD 또는 none'}, tags: {type: 'array', items: {type: 'string', maxLength: 20}, maxItems: 10}, week_key: {type: 'string', description: 'YYYY-Www (ISO 주)'}, timetable_text: {type: 'string', maxLength: 4000}}, required: ['action'], additionalProperties: false}},
];
export const MANAGE_TOOL_NAMES = MANAGE_TOOLS.map(tool => tool.name);

// ---- Planning ----
export async function planManage(name: string, args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const teacher = await contextForUid(ctx.uid);
  switch (name) {
    case 'manage_homework': return homework(args, ctx);
    case 'manage_exhibition': return exhibition(args, ctx);
    case 'manage_board': return board(args, ctx);
    case 'manage_quiz': return quiz(args, ctx);
    case 'manage_review': return review(args, ctx);
    case 'manage_playground': return playground(args, ctx, teacher);
    case 'manage_points': return points(args, ctx);
    case 'manage_cards': return cards(args, ctx);
    case 'manage_class_tools': return classTools(args, ctx);
    case 'manage_class': return classes(args, ctx);
    case 'manage_workspace': return workspace(args, ctx, teacher);
  }
  throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
}

async function homework(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const id = safeId(args.assignment_id, '숙제'), task = await owned(`assignments/${id}`, ctx.uid, '숙제');
  const target = `${task.className ?? ''} · ${task.title}`, action = args.action;
  if (action === 'edit') {
    if (task.visibility === 'hidden') throw new BerryError('숨긴 숙제예요. 먼저 다시 표시해 주세요.');
    const title = args.title ?? task.title, description = args.description ?? task.description ?? '';
    const dueAt = args.due_at === undefined ? task.dueAt ?? null : args.due_at === 'none' ? null : instant(args.due_at, 'due_at');
    const changes = [args.title !== undefined && change('제목', task.title, title), args.description !== undefined && change('설명', String(task.description ?? '').slice(0, 40), String(description).slice(0, 40)), args.due_at !== undefined && change('마감', clock(task.dueAt), clock(dueAt))].filter(Boolean) as string[];
    // Submission type and linked rooms: the same options as the homework edit screen. The type changes only while nobody has handed in.
    const oldType = assignmentSubmissionType(task.submissionType), requested = pick(args.submission_type, submissionTypes, 'submission_type'), type = requested ?? oldType, typeChanged = type !== oldType;
    if (typeChanged) {
      const sent = await Promise.all(['submissions', 'submissionTrash', 'videoSubmissionSlots'].map(name => db().collection(name).where('assignmentId', '==', id).limit(1).get()));
      if (sent.some(found => !found.empty)) throw new BerryError('이미 제출한 학생이 있어 제출 방식을 바꿀 수 없어요. 같은 내용으로 새 숙제방을 여는 방법(create_assignment)을 제안해 주세요.', 409, 'conflict');
      changes.push(change('제출 방식', typeLabel(oldType), typeLabel(type)));
    }
    const noExhibition = type === 'text' || type === 'audio', wasExhibition = !!task.sync?.exhibitionId, wasBoard = !!task.sync?.boardId;
    const askedExhibition = bool(args.sync_exhibition, 'sync_exhibition'), askedBoard = bool(args.sync_board, 'sync_board');
    if (askedExhibition && noExhibition) throw new BerryError(`${typeLabel(type)} 숙제는 전시실에 연동되지 않아요. 참여보드 연동(sync_board)을 써 주세요.`);
    const exhibition = noExhibition ? false : askedExhibition ?? wasExhibition, board = askedBoard ?? wasBoard;
    if (exhibition !== wasExhibition) changes.push(`${change('전시실 연동', wasExhibition, exhibition)}${askedExhibition === undefined ? ` (${typeLabel(type)} 숙제는 전시실 연동 불가)` : ''}`);
    if (board !== wasBoard) changes.push(change('보드 연동', wasBoard, board));
    const syncChanged = exhibition !== wasExhibition || board !== wasBoard;
    if (!changes.length) throw new BerryError('바꿀 내용(title·description·due_at·submission_type·sync_exhibition·sync_board)을 알려 주세요. 지금 값과 같으면 바꿀 것이 없어요.');
    const roomNote = syncChanged ? ' 연동을 켜면 같은 이름의 방이 열리고 이미 낸 제출물도 올라가요. 끄면 방과 올라간 작품은 그대로 남고 새 제출만 올라가지 않아요.' : '';
    return {view: {target, action: '숙제 고치기', changes, note: `${STUDENT}${roomNote}`}, calls: [{route: 'api', segments: ['assignment', id], method: 'PATCH', body: {title, description, dueAt, ...(typeChanged ? {submissionType: type} : {}), ...(typeChanged || syncChanged ? {sync: {exhibition, board}} : {})}}], savedNote: '숙제를 고쳤어요.'};
  }
  if (action === 'hide' || action === 'restore') {
    return {view: {target, action: action === 'hide' ? '학생 화면에서 숨기기' : '다시 표시', note: action === 'hide' ? '제출물과 피드백은 그대로 보관돼요.' : STUDENT}, calls: [{route: 'visibility', segments: [], method: 'POST', body: {classId: task.classId, action, items: [{id, visibilityVersion: Number(task.visibilityVersion) || 0}]}}], savedNote: action === 'hide' ? '숨겼어요.' : '다시 표시했어요.'};
  }
  const submissions = (await db().collection('submissions').where('assignmentId', '==', id).get()).docs.map(doc => doc.data());
  const roster = await activeStudents(task.classId), numberOf = new Map(roster.map(student => [student.id, student.number]));
  if (action === 'review') {
    const status = pick(args.status, ['done', 'revision'] as const, 'status');
    if (!status) throw new BerryError('status(done 또는 revision)를 알려 주세요.');
    const students = await studentsByNumber(task.classId, args.student_numbers), feedback = typeof args.feedback === 'string' ? args.feedback : '';
    const calls = students.map(student => {
      const submission = submissions.find(row => row.studentId === student.id);
      if (!submission?.attemptId) throw new BerryError(`${student.label}은(는) 아직 제출하지 않았어요.`);
      return {route: 'api' as const, segments: ['review', id], method: 'POST' as const, body: {studentId: student.id, attemptId: submission.attemptId, status, feedback}, label: student.label};
    });
    return {view: {target, action: status === 'done' ? '검사 완료' : '다시 하기 요청', students: students.map(student => student.label), body: feedback || null, note: status === 'done' ? `${STUDENT} 검사 완료 1명마다 보말이 지급돼요(처음 1회).` : STUDENT}, calls, savedNote: status === 'done' ? '검사 완료로 바꿨어요.' : '다시 하기로 돌려보냈어요.'};
  }
  if (action === 'review_all') {
    const waiting = submissions.filter(row => row.status === 'submitted' && row.attemptId && numberOf.has(row.studentId));
    if (!waiting.length) throw new BerryError('검사를 기다리는 제출이 없어요.');
    const feedback = typeof args.feedback === 'string' ? args.feedback : undefined, calls: ManageCall[] = [];
    for (let index = 0; index < waiting.length; index += 50) calls.push({route: 'api', segments: ['review-batch', id], method: 'POST', body: {items: waiting.slice(index, index + 50).map(row => ({studentId: row.studentId, attemptId: row.attemptId, ...(feedback ? {feedback} : {})}))}});
    const edited = waiting.filter(row => row.editedAt).length;
    return {view: {target, action: '제출한 학생 모두 검사 완료', count: waiting.length, students: waiting.map(row => alias(numberOf.get(row.studentId) ?? 0)).sort(), body: feedback ?? null, note: `${STUDENT} 검사 완료 1명마다 보말이 지급돼요(처음 1회).${edited ? ` 제출 뒤 학생이 고친 숙제 ${edited}건이 포함돼요. 검사하면 학생은 더 고칠 수 없어요.` : ''}`}, calls, savedNote: `${waiting.length}명을 검사 완료로 바꿨어요.`};
  }
  throw new BerryError('action을 확인해 주세요.');
}

const THEMES: Record<string, string> = {cozy: '아늑한', forest: '숲', sky: '하늘', ocean: '바다', earth: '우주·지구 궤도', moon: '우주·달 분화구', saturn: '우주·토성 고리'}, ROOM_STATUS: Record<string, string> = {draft: '준비 중', open: '열림', closed: '마감'};
async function exhibition(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const id = safeId(args.exhibition_id, '전시실'), room = await owned(`exhibitions/${id}`, ctx.uid, '전시실'), target = `${room.className ?? ''} · ${room.title}`;
  if (args.action === 'update') {
    const body: Data = {}, changes: string[] = [];
    const set = (key: string, value: unknown, label: string, before: unknown, after = value) => {if (value === undefined) return; body[key] = value; changes.push(change(label, before, after));};
    set('title', args.title, '이름', room.title);
    set('description', args.description, '소개', String(room.description ?? '').slice(0, 40), String(args.description ?? '').slice(0, 40));
    set('tags', args.tags, '태그', room.tags ?? []);
    const status = pick(args.status, ['draft', 'open', 'closed'] as const, 'status'), theme = pick(args.theme, ['cozy', 'forest', 'sky', 'ocean', 'earth', 'moon', 'saturn'] as const, 'theme');
    set('status', status, '상태', ROOM_STATUS[room.status] ?? room.status, status && ROOM_STATUS[status]);
    set('theme', theme, '테마', THEMES[room.theme] ?? room.theme, theme && THEMES[theme]);
    set('commentsEnabled', bool(args.comments, 'comments'), '댓글', room.commentsEnabled);
    set('allowStudentUploads', bool(args.student_uploads, 'student_uploads'), '학생 업로드', room.allowStudentUploads);
    set('publicSharingEnabled', bool(args.qr_public, 'qr_public'), 'QR 공개', room.publicSharingEnabled);
    const modules = room.artworkModules ?? {}, docent = bool(args.docent, 'docent'), publicAudio = bool(args.docent_public_audio, 'docent_public_audio'), guestbook = bool(args.guestbook, 'guestbook'), artbook = bool(args.artbook, 'artbook');
    if ([docent, publicAudio, guestbook, artbook].some(value => value !== undefined)) {
      // artworkModules is replaced whole by the handler, so every flag is resent with its current value.
      const voice = modules.voice ?? {}, book = modules.guestbook ?? {};
      body.artworkModules = {artbook: {enabled: artbook ?? modules.artbook?.enabled === true}, voice: {enabled: docent ?? voice.enabled === true, publicAudio: publicAudio ?? voice.publicAudio === true}, guestbook: {enabled: guestbook ?? book.enabled === true, students: book.students !== false, visitorStickers: book.visitorStickers === true, visitorComments: book.visitorComments === true}};
      if (docent !== undefined) changes.push(change('도슨트 녹음', voice.enabled === true, docent));
      if (publicAudio !== undefined) changes.push(change('도슨트 외부 재생', voice.publicAudio === true, publicAudio));
      if (guestbook !== undefined) changes.push(change('방명록', book.enabled === true, guestbook));
      if (artbook !== undefined) changes.push(change('아트북', modules.artbook?.enabled === true, artbook));
    }
    if (!changes.length) throw new BerryError('바꿀 설정을 알려 주세요.');
    return {view: {target, action: '전시실 설정', changes, note: args.qr_public === true ? PUBLIC : STUDENT}, calls: [{route: 'exhibitions', segments: [id], method: 'PATCH', body}], savedNote: '전시실 설정을 바꿨어요.'};
  }
  if (args.action === 'edit_artwork') {
    const artworkId = safeId(args.artwork_id, '작품'), work = (await db().doc(`exhibitions/${id}/artworks/${artworkId}`).get()).data();
    if (!work) throw new BerryError('이 작품을 찾을 수 없어요.', 404, 'not_found');
    const body: Data = {}, changes: string[] = [];
    if (args.artwork_title !== undefined) {body.title = args.artwork_title; changes.push(change('제목', work.title, args.artwork_title));}
    if (args.artwork_description !== undefined) {body.description = args.artwork_description; changes.push(change('설명', String(work.description ?? '').slice(0, 40), String(args.artwork_description).slice(0, 40)));}
    if (args.artwork_date !== undefined) {body.artworkDate = day(args.artwork_date, 'artwork_date'); changes.push(change('날짜', work.artworkDate, body.artworkDate));}
    const status = pick(args.artwork_status, ['approved', 'revision'] as const, 'artwork_status');
    if (status) {body.status = status; changes.push(change('상태', work.status, status === 'approved' ? '승인' : '다시 하기'));}
    if (args.feedback !== undefined) {body.feedback = args.feedback; changes.push(`피드백: ${args.feedback}`);}
    if (!changes.length) throw new BerryError('작품에서 바꿀 내용을 알려 주세요.');
    return {view: {target: `${target} · ${work.title ?? '작품'}`, action: '작품 고치기', changes, note: STUDENT}, calls: [{route: 'exhibitions', segments: [id, 'artworks', artworkId], method: 'PATCH', body}], savedNote: '작품을 고쳤어요.'};
  }
  if (args.action === 'set_dates') {
    const date = day(args.date), ids = Array.isArray(args.artwork_ids) && args.artwork_ids.length ? args.artwork_ids.map((value: unknown) => safeId(value, '작품')) : undefined;
    return {view: {target, action: '작품 날짜 일괄 변경', changes: [`날짜 → ${date}`], count: ids ? ids.length : Number(room.artworkCount) || null}, calls: [{route: 'exhibitions', segments: [id, 'artwork-dates'], method: 'POST', body: {artworkDate: date, ...(ids ? {artworkIds: ids} : {})}}], savedNote: `작품 날짜를 ${date}로 바꿨어요.`};
  }
  if (args.action === 'delete') {
    return {view: {target, action: '전시실 삭제', count: Number(room.artworkCount) || 0, danger: '전시실과 작품 사진·도슨트 녹음·방명록·공유 링크가 모두 지워지고 되돌릴 수 없어요.'}, calls: [{route: 'exhibitions', segments: [id], method: 'DELETE', body: {confirm: true}}], savedNote: '전시실을 삭제했어요.'};
  }
  throw new BerryError('action을 확인해 주세요.');
}

async function board(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const id = safeId(args.board_id, '보드'), value = await owned(`participationBoards/${id}`, ctx.uid, '보드'), target = `${value.className ?? ''} · ${value.title}`;
  const post = async () => {
    const postId = safeId(args.post_id, '게시물'), data = (await db().doc(`participationBoards/${id}/posts/${postId}`).get()).data();
    if (!data || data.deleted) throw new BerryError('이 게시물을 찾을 수 없어요.', 404, 'not_found');
    return {postId, data, label: String(data.title || data.body || '게시물').slice(0, 40)};
  };
  switch (args.action) {
    case 'update': {
      const body: Data = {}, changes: string[] = [];
      const set = (key: string, input: unknown, label: string) => {if (input === undefined) return; body[key] = input; changes.push(change(label, value[key] ?? value.settings?.[key], input));};
      set('title', args.title, '이름'); set('description', args.description, '소개');
      set('layout', pick(args.layout, ['wall', 'columns', 'grid', 'table', 'freeform', 'rows', 'timeline', 'stream', 'map'] as const, 'layout'), '배치');
      set('theme', pick(args.theme, ['peach', 'mint', 'lavender', 'sky', 'lemon', 'rose'] as const, 'theme'), '테마');
      set('status', pick(args.status, ['open', 'frozen'] as const, 'status'), '상태'); set('sort', pick(args.sort, ['manual', 'newest', 'oldest'] as const, 'sort'), '정렬');
      set('commentsEnabled', bool(args.comments, 'comments'), '댓글'); set('reactionsEnabled', bool(args.reactions, 'reactions'), '반응');
      set('moderation', bool(args.moderation, 'moderation'), '승인제'); set('anonymous', bool(args.anonymous, 'anonymous'), '익명');
      set('publicViewEnabled', bool(args.public_view, 'public_view'), '외부 공개'); set('visitorComments', bool(args.visitor_comments, 'visitor_comments'), '방문자 댓글');
      if (!changes.length) throw new BerryError('바꿀 설정을 알려 주세요.');
      return {view: {target, action: '보드 설정', changes, note: args.public_view === true ? PUBLIC : STUDENT}, calls: [{route: 'boards', segments: [id], method: 'PATCH', body}], savedNote: '보드 설정을 바꿨어요.'};
    }
    case 'post': {
      if (![args.post_title, args.text, args.link].some(entry => typeof entry === 'string' && entry.trim())) throw new BerryError('올릴 내용(text·post_title·link)을 알려 주세요.');
      const body = {requestId: randomUUID(), ...(args.post_title ? {title: args.post_title} : {}), ...(args.text ? {body: args.text} : {}), ...(args.link ? {link: args.link} : {})};
      return {view: {target, action: '선생님 글 올리기', title: args.post_title ?? null, body: args.text ?? null, url: args.link ?? null, note: STUDENT}, calls: [{route: 'boards', segments: [id, 'posts'], method: 'POST', body}], savedNote: '글을 올렸어요.'};
    }
    case 'hide_post': case 'show_post': case 'pin_post': case 'unpin_post': {
      const found = await post(), patch = args.action === 'hide_post' ? {status: 'hidden'} : args.action === 'show_post' ? {status: 'published'} : {pinned: args.action === 'pin_post'};
      const label = {hide_post: '글 숨기기', show_post: '글 공개', pin_post: '글 고정', unpin_post: '고정 해제'}[args.action as string];
      return {view: {target: `${target} · ${found.label}`, action: label, note: STUDENT}, calls: [{route: 'boards', segments: [id, 'posts', found.postId], method: 'PATCH', body: {version: Number(found.data.version) || 0, ...patch}}], savedNote: `${label}를 했어요.`};
    }
    case 'delete_post': {
      const found = await post();
      return {view: {target: `${target} · ${found.label}`, action: '글 삭제', danger: '글과 댓글이 보드에서 사라져요.'}, calls: [{route: 'boards', segments: [id, 'posts', found.postId], method: 'DELETE'}], savedNote: '글을 지웠어요.'};
    }
    case 'share_link': return {view: {target, action: '공개 링크 만들기', note: PUBLIC}, calls: [{route: 'boards', segments: [id, 'share'], method: 'POST', body: {}}], savedNote: '공개 링크를 만들었어요. 보드 화면의 공유 버튼에서 확인하세요.'};
    case 'rotate_link': return {view: {target, action: '공개 링크 다시 만들기', danger: '지금 쓰는 공개 링크·QR은 더 이상 열리지 않아요.'}, calls: [{route: 'boards', segments: [id, 'share'], method: 'POST', body: {rotate: true}}], savedNote: '새 공개 링크를 만들었어요.'};
    case 'archive': return {view: {target, action: '보드 보관', note: '보관하면 학생 화면 목록에서 빠져요.'}, calls: [{route: 'boards', segments: [id], method: 'DELETE'}], savedNote: '보드를 보관했어요.'};
  }
  throw new BerryError('action을 확인해 주세요.');
}

async function quiz(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const cls = await ownedClass(ctx.uid, args.class_id), target = String(cls.name ?? '');
  if (args.action === 'set_grade') {
    const grade = Number(args.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) throw new BerryError('grade는 1~6이에요.');
    return {view: {target, action: '퀴즈 학년 바꾸기', changes: [change('학년', cls.grade, grade)], danger: '반 전체의 영어·수학 퀴즈 문제가 이 학년 기준으로 바뀌어요.'}, calls: [{route: 'quiz', segments: ['grade'], method: 'POST', body: {classId: cls.id, grade}}], savedNote: '퀴즈 학년을 바꿨어요.'};
  }
  const date = day(args.date ?? 'tomorrow'), today = seoulDate(Date.now()), tomorrow = seoulDate(Date.now() + 86_400_000);
  if (date !== today && date !== tomorrow) throw new BerryError('퀴즈 범위는 오늘이나 내일만 정할 수 있어요.');
  if (args.action === 'clear_range') return {view: {target, action: '퀴즈 범위 지우기', date}, calls: [{route: 'quiz', segments: ['range'], method: 'POST', body: {classId: cls.id, date, english: null, math: null}}], savedNote: '퀴즈 범위를 지웠어요.'};
  if (args.action === 'set_range') {
    const from = args.english_from, to = args.english_to ?? args.english_from, english = from === undefined ? null : {kind: 'stages', from: Number(from), to: Number(to)}, math = args.math_stage === undefined ? null : {stage: Number(args.math_stage)};
    if (!english && !math) throw new BerryError('영어(english_from·english_to)나 수학(math_stage) 범위를 알려 주세요.');
    return {view: {target, action: '퀴즈 범위 정하기', date, changes: [english && `영어: ${english.from}~${english.to}단계`, math && `수학: ${math.stage}단계`].filter(Boolean), note: '그날 퀴즈에 바로 반영돼요.'}, calls: [{route: 'quiz', segments: ['range'], method: 'POST', body: {classId: cls.id, date, english, math}}], savedNote: '퀴즈 범위를 정했어요.'};
  }
  throw new BerryError('action을 확인해 주세요.');
}

async function review(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const cls = await ownedClass(ctx.uid, args.class_id);
  if (args.action === 'rewards_on' || args.action === 'rewards_off') return {view: {target: String(cls.name ?? ''), action: args.action === 'rewards_on' ? '복습 보상 켜기' : '복습 보상 끄기'}, calls: [{route: 'review', segments: ['teacher', 'settings'], method: 'POST', body: {classId: cls.id, rewardsEnabled: args.action === 'rewards_on'}}], savedNote: '복습 보상 설정을 바꿨어요.'};
  const lessonId = safeId(args.lesson_id, '복습'), lesson = await owned(`classes/${cls.id}/lessonReviews/${lessonId}`, ctx.uid, '복습'), target = `${cls.name ?? ''} · ${lesson.title ?? '복습'}`;
  if (args.action === 'hide' || args.action === 'show') {
    // The handler toggles, so the plan refuses when the lesson is already where the teacher wants it.
    if (lesson.status === 'draft') throw new BerryError('아직 배포하지 않은 초안이에요. 배포는 publish_review로 해요.');
    if ((args.action === 'hide') === (lesson.status === 'hidden')) throw new BerryError(args.action === 'hide' ? '이미 숨긴 복습이에요.' : '이미 보이는 복습이에요.');
    return {view: {target, action: args.action === 'hide' ? '복습 숨기기' : '복습 다시 보이기', note: STUDENT}, calls: [{route: 'review', segments: ['teacher', 'hide'], method: 'POST', body: {classId: cls.id, lessonId}}], savedNote: args.action === 'hide' ? '복습을 숨겼어요.' : '복습을 다시 보이게 했어요.'};
  }
  if (args.action === 'delete_draft') {
    if (lesson.status !== 'draft') throw new BerryError('초안만 지울 수 있어요.');
    return {view: {target, action: '복습 초안 삭제', danger: '초안 내용이 지워지고 되돌릴 수 없어요.'}, calls: [{route: 'review', segments: ['teacher', 'delete'], method: 'POST', body: {classId: cls.id, lessonId}}], savedNote: '초안을 지웠어요.'};
  }
  throw new BerryError('action을 확인해 주세요.');
}

async function playground(args: Data, ctx: BearerContext, teacher: Context): Promise<ManagePlan> {
  const cls = await ownedClass(ctx.uid, args.class_id), target = String(cls.name ?? ''), query = `classId=${encodeURIComponent(cls.id)}`;
  if (args.action === 'settings') {
    const current = (await read({route: 'playground', segments: ['teacher', 'settings'], query}, teacher)).settings ?? {};
    const next = {...current}, changes: string[] = [];
    const set = (key: string, input: unknown, label: string) => {if (input === undefined) return; next[key] = input; changes.push(change(label, current[key], input));};
    set('enabled', bool(args.enabled, 'enabled'), '말놀이터'); set('allowDuels', bool(args.duels, 'duels'), '대결'); set('showRankings', bool(args.rankings, 'rankings'), '순위 보이기'); set('rewardsEnabled', bool(args.rewards, 'rewards'), '보상');
    set('soloReward', args.solo_reward, '혼자하기 보상'); set('duelReward', args.duel_reward, '대결 보상');
    if (!changes.length) throw new BerryError('바꿀 설정을 알려 주세요.');
    return {view: {target, action: '말놀이터 설정', changes, note: STUDENT}, calls: [{route: 'playground', segments: ['teacher', 'settings'], method: 'PUT', query, body: {classId: cls.id, enabled: next.enabled, allowDuels: next.allowDuels, showRankings: next.showRankings, rewardsEnabled: next.rewardsEnabled, soloReward: next.soloReward, duelReward: next.duelReward, timeWindows: next.timeWindows ?? []}}], savedNote: '말놀이터 설정을 바꿨어요.'};
  }
  if (args.action === 'add_item') {
    const kind = pick(args.kind, ['nonsense', 'riddle', 'vocab', 'spelling'] as const, 'kind') ?? 'vocab', band = pick(args.grade_band, ['low', 'mid', 'high'] as const, 'grade_band') ?? (Number(cls.grade) <= 2 ? 'low' : Number(cls.grade) <= 4 ? 'mid' : 'high');
    if (typeof args.prompt !== 'string' || !args.prompt.trim() || !Array.isArray(args.answers) || !args.answers.length || typeof args.reveal !== 'string' || !args.reveal.trim()) throw new BerryError('문제(prompt), 정답(answers), 풀이(reveal)를 알려 주세요.');
    const item = {kind, gradeBand: band, prompt: args.prompt, answers: args.answers, reveal: args.reveal, ...(Array.isArray(args.choices) && args.choices.length ? {choices: args.choices} : {}), ...(Array.isArray(args.hints) && args.hints.length ? {hints: args.hints} : {}), enabled: true};
    return {view: {target, action: '말놀이터 문제 추가', title: args.prompt, body: `정답: ${args.answers.join(', ')}\n풀이: ${args.reveal}`, note: STUDENT}, calls: [{route: 'playground', segments: ['teacher', 'items'], method: 'POST', query, body: {classId: cls.id, item}}], savedNote: '문제를 추가했어요.'};
  }
  throw new BerryError('action을 확인해 주세요.');
}

async function points(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const cls = await ownedClass(ctx.uid, args.class_id), target = String(cls.name ?? ''), label = String(cls.pointSettings?.label || '보말');
  if (args.action === 'settings') {
    const current = cls.pointSettings ?? {}, next = {enabled: bool(args.enabled, 'enabled') ?? current.enabled === true, label: typeof args.label === 'string' && args.label.trim() ? args.label.trim() : label, rules: {homework: args.homework_points ?? Number(current.rules?.homework ?? 10)}};
    const changes = [args.enabled !== undefined && change('사용', current.enabled === true, next.enabled), args.label !== undefined && change('이름', label, next.label), args.homework_points !== undefined && change('숙제 검사 보상', current.rules?.homework, next.rules.homework)].filter(Boolean);
    if (!changes.length) throw new BerryError('바꿀 설정을 알려 주세요.');
    return {view: {target, action: `${label} 설정`, changes}, calls: [{route: 'points', segments: ['classes', cls.id, 'settings'], method: 'POST', body: next}], savedNote: `${label} 설정을 바꿨어요.`};
  }
  if (args.action !== 'grant' && args.action !== 'revoke') throw new BerryError('action을 확인해 주세요.');
  const amount = Number(args.amount), reason = typeof args.reason === 'string' ? args.reason.trim() : '';
  if (!Number.isInteger(amount) || amount < 1) throw new BerryError('amount(1 이상)를 알려 주세요.');
  if (!reason) throw new BerryError('사유(reason)를 꼭 알려 주세요.');
  if (cls.pointSettings?.enabled !== true) throw new BerryError(`이 학급은 ${label}이(가) 꺼져 있어요. 먼저 켜 주세요.`);
  const students = args.all_students === true ? (await activeStudents(cls.id)).map(student => ({...student, label: alias(student.number)})) : await studentsByNumber(cls.id, args.student_numbers);
  const grant = args.action === 'grant';
  return {view: {target, action: grant ? `${label} 주기` : `${label} 빼기`, students: students.map(student => student.label), count: students.length, amount, reason, ...(grant ? {note: '학생 화면 잔액에 바로 반영돼요.'} : {danger: `${students.length}명에게서 ${amount}점씩 빼요. 잔액이 모자란 학생이 있으면 전체가 취소돼요.`})}, calls: [{route: 'points', segments: ['classes', cls.id, grant ? 'grant' : 'revoke'], method: 'POST', body: {studentIds: students.map(student => student.id), amount, reason, requestId: randomUUID()}}], savedNote: `${students.length}명에게 ${label} ${amount}점을 ${grant ? '줬어요' : '뺐어요'}.`};
}

async function distributeCall(args: Data, ctx: BearerContext, cls: Data & {id: string}, set: {id?: string; type: string; cardCount: number; version?: unknown}): Promise<{call: ManageCall; lines: string[]; dueAt: string | null}> {
  const dueAt = args.due_at ? instant(args.due_at, 'due_at') : null;
  const {requiredModes, test, afterDue, lines, speechRate} = cardDistributionSettings(args, set.cardCount, !!dueAt, await classDefaultsFor(cls.id, ctx.uid, set.type === 'sentence' ? 'sentence' : 'word'));
  const body = {classId: cls.id, ...(set.id ? {setId: set.id} : {}), ...(Number.isInteger(set.version) ? {expectedVersion: set.version} : {}), requiredModes, test, dueAt, afterDue, ...(speechRate ? {speechRate} : {}), requestId: randomUUID()};
  return {call: {route: 'cards', segments: ['distributions'], method: 'POST', body, label: '배부', ...(set.id ? {} : {chain: 'setId' as const})}, lines, dueAt};
}
/** create_set / create_review_set: the AI draft runs now, so the preview shows the real cards; nothing is stored until the teacher confirms. */
async function cardSetPlan(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  const cls = args.class_id ? await ownedClass(ctx.uid, args.class_id) : null;
  let title: string, type: 'word' | 'sentence' | 'drill' = 'word', cards: {front: string; back: string; example: string; alternatives?: string[]; chunks?: number[]; drill?: unknown}[], description: string, source: string;
  if (args.action === 'create_review_set') {
    const id = safeId(args.distribution_id, '배부'), owned_ = await owned(`cardClassSets/${id}`, ctx.uid, '카드 배부');
    const report = await read({route: 'cards', segments: ['distributions', id, 'report']}, await contextForUid(ctx.uid));
    const snapshot = report.distribution?.snapshot ?? {title: owned_.title, type: 'word', cards: []};
    const input = reviewDraftInput(args, snapshot.type);
    const picked = cardReviewCandidates(Array.isArray(report.students) ? report.students : [], snapshot.cards ?? [], input.count).map(row => row.card);
    if (!picked.length) throw new BerryError('이 배부에는 아직 틀린 카드가 없어요.');
    type = snapshot.type; title = String(args.set_title ?? `${snapshot.title} 복습`).trim().slice(0, 120);
    const examples = input.rewrite ? await draftCardsFor(ctx.uid, {mode: 'review', level: input.level, cards: picked.map((card: Data) => ({front: card.front, back: card.back, example: card.example ?? ''}))}) : null;
    cards = picked.map((card: Data, index: number) => ({...card, front: String(card.front), back: String(card.back ?? ''), example: examples?.[index]?.example || card.example || ''}));
    description = `${snapshot.title}에서 많이 틀린 카드`.slice(0, 500); source = input.rewrite ? '많이 틀린 카드 · AI가 예문만 새로 씀' : '많이 틀린 카드 · 예문 그대로';
  } else {
    const input = cardSetDraftInput(args);
    title = input.title; cards = (await draftCardsFor(ctx.uid, input.request)).filter(card => card.front && card.back).slice(0, 60);
    if (!cards.length) throw new BerryError('AI 초안에 카드가 없어요. 주제나 단어를 바꿔 다시 말해 주세요.');
    description = input.description; source = input.label;
  }
  const save: ManageCall = {route: 'cards', segments: ['sets'], method: 'POST', label: '세트 저장', body: {requestId: randomUUID(), title, description, type, folderId: null, cards: cards.map(card => ({id: randomUUID(), front: card.front, back: card.back, example: card.example ?? '', alternatives: card.alternatives ?? [], ...(card.chunks ? {chunks: card.chunks} : {}), ...(card.drill ? {drill: card.drill} : {})}))}};
  const preview = setDraftPreview(cards);
  if (!cls) return {view: {target: title, action: '카드 세트 만들기', count: cards.length, changes: [`재료: ${source}`], body: preview, note: 'AI 초안이에요. 저장하면 카드놀이 내 세트에 생기고, 학생에게는 아직 보이지 않아요. 카드놀이 화면에서 고친 뒤 배부할 수 있어요.'}, calls: [save], savedNote: '카드 세트를 만들었어요. 카드놀이에서 확인하고 배부해 주세요.'};
  const {call, lines, dueAt} = await distributeCall(args, ctx, cls, {type, cardCount: cards.length, version: 1});
  return {view: {target: `${cls.name ?? ''} · ${title}`, action: '카드 세트 만들기 + 배부', count: cards.length, due_at: clock(dueAt), changes: [`재료: ${source}`, ...lines], body: preview, note: `AI 초안이에요. 저장하면 세트가 생기고 바로 배부돼요. ${STUDENT}`}, calls: [save, call], savedNote: '카드 세트를 만들어 배부했어요.'};
}

async function cards(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  if (args.action === 'create_set' || args.action === 'create_review_set') return cardSetPlan(args, ctx);
  if (args.action === 'stop' || args.action === 'resume') {
    const id = safeId(args.distribution_id, '배부'), value = await owned(`cardClassSets/${id}`, ctx.uid, '카드 배부');
    return {view: {target: String(value.title ?? '카드'), action: args.action === 'stop' ? '배부 멈추기' : '배부 다시 열기', note: STUDENT}, calls: [{route: 'cards', segments: ['distributions', id], method: 'PATCH', body: {active: args.action === 'resume'}}], savedNote: args.action === 'stop' ? '배부를 멈췄어요.' : '배부를 다시 열었어요.'};
  }
  if (args.action !== 'distribute') throw new BerryError('action을 확인해 주세요.');
  const cls = await ownedClass(ctx.uid, args.class_id);
  let set: Data & {id: string};
  if (args.set_id) set = {id: safeId(args.set_id, '카드 세트'), ...(await owned(`cardSets/${safeId(args.set_id, '카드 세트')}`, ctx.uid, '카드 세트'))};
  else {
    const words = String(args.set_title ?? '').trim().toLowerCase();
    if (!words) throw new BerryError('카드 세트 이름(set_title)을 알려 주세요.');
    const found = (await db().collection('cardSets').where('ownerUid', '==', ctx.uid).select('title', 'archived', 'version', 'cardCount', 'ownerUid', 'type').get()).docs.filter(doc => !doc.data().archived && String(doc.data().title ?? '').toLowerCase().includes(words));
    if (found.length !== 1) throw new BerryError(found.length ? `"${args.set_title}"이(가) 들어간 세트가 ${found.length}개예요: ${found.slice(0, 5).map(doc => doc.data().title).join(', ')}. 정확한 이름을 알려 주세요.` : '그 이름의 카드 세트를 찾지 못했어요.', found.length ? 400 : 404, found.length ? 'invalid_request' : 'not_found');
    set = {id: found[0].id, ...found[0].data()};
  }
  if (set.archived) throw new BerryError('보관한 카드 세트예요.');
  const cardCount = Number(set.cardCount);
  if (!Number.isInteger(cardCount) || cardCount < 1) throw new BerryError('카드가 없는 세트예요. 카드놀이 화면에서 확인해 주세요.');
  const {call, lines, dueAt} = await distributeCall(args, ctx, cls, {id: set.id, type: String(set.type ?? 'word'), cardCount, version: set.version});
  return {view: {target: `${cls.name ?? ''} · ${set.title}`, action: '카드 배부', count: cardCount, due_at: clock(dueAt), changes: lines, note: STUDENT}, calls: [{...call, label: undefined}], savedNote: '카드를 배부했어요.'};
}

async function classTools(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  switch (args.action) {
    case 'create_poll': {
      const cls = await ownedClass(ctx.uid, args.class_id), options = Array.isArray(args.options) ? args.options.map(String).map(value => value.trim()).filter(Boolean) : [];
      if (typeof args.title !== 'string' || !args.title.trim()) throw new BerryError('투표 질문(title)을 알려 주세요.');
      if (options.length < 2) throw new BerryError('보기(options)를 2개 이상 알려 주세요.');
      const closesAt = args.closes_at ? instant(args.closes_at, 'closes_at') : undefined, showResults = pick(args.show_results, ['live', 'closed'] as const, 'show_results') ?? 'live';
      return {view: {target: String(cls.name ?? ''), action: '투표 만들기', title: args.title, body: options.join('\n'), due_at: clock(closesAt), note: STUDENT}, calls: [{route: 'links', segments: ['polls'], method: 'POST', body: {classId: cls.id, title: args.title.trim(), sourceKind: 'manual', options, showResults, hideNames: args.hide_names === true, requestId: randomUUID(), ...(closesAt ? {closesAt} : {})}}], savedNote: '투표를 열었어요.'};
    }
    case 'close_poll': case 'reopen_poll': {
      const id = safeId(args.poll_id, '투표'), poll = (await db().doc(`classPolls/${id}`).get()).data();
      if (!poll) throw new BerryError('이 투표를 찾을 수 없어요.', 404, 'not_found');
      await ownedClass(ctx.uid, poll.classId);
      return {view: {target: String(poll.title ?? poll.question ?? '투표'), action: args.action === 'close_poll' ? '투표 마감' : '투표 다시 열기'}, calls: [{route: 'links', segments: ['polls', id], method: 'PATCH', body: {status: args.action === 'close_poll' ? 'closed' : 'open'}}], savedNote: args.action === 'close_poll' ? '투표를 마감했어요.' : '투표를 다시 열었어요.'};
    }
    case 'create_canvas': {
      const cls = await ownedClass(ctx.uid, args.class_id);
      if (typeof args.title !== 'string' || !args.title.trim()) throw new BerryError('캔버스 제목(title)을 알려 주세요.');
      return {view: {target: String(cls.name ?? ''), action: '캔버스 만들기', title: args.title, body: args.mission ?? null, note: '반 전체가 함께 그리는 캔버스가 열려요.'}, calls: [{route: 'canvases', segments: [], method: 'POST', body: {classId: cls.id, title: args.title.trim(), ...(args.mission ? {mission: args.mission} : {}), studentIds: [], requestId: randomUUID()}}], savedNote: '캔버스를 열었어요.'};
    }
    case 'freeze_canvas': case 'open_canvas': case 'archive_canvas': {
      const id = safeId(args.canvas_id, '캔버스'), canvas = await owned(`classCanvases/${id}`, ctx.uid, '캔버스'), status = {freeze_canvas: 'frozen', open_canvas: 'open', archive_canvas: 'archived'}[args.action as string];
      return {view: {target: String(canvas.title ?? '캔버스'), action: {frozen: '캔버스 잠그기', open: '캔버스 다시 열기', archived: '캔버스 보관'}[status!]}, calls: [{route: 'canvases', segments: [id], method: 'PATCH', body: {status}}], savedNote: '캔버스 상태를 바꿨어요.'};
    }
  }
  throw new BerryError('action을 확인해 주세요.');
}

async function classes(args: Data, ctx: BearerContext): Promise<ManagePlan> {
  if (args.action === 'create_class') {
    if (typeof args.name !== 'string' || !args.name.trim()) throw new BerryError('학급 이름(name)을 알려 주세요.');
    const year = args.year ?? Number(seoulDate(Date.now()).slice(0, 4));
    return {view: {target: args.name, action: '학급 만들기', changes: [`학년: ${shown(args.grade)}`, `학년도: ${year}`]}, calls: [{route: 'api', segments: ['classes'], method: 'POST', body: {name: args.name.trim(), ...(args.grade ? {grade: String(args.grade)} : {}), year}}], savedNote: '학급을 만들었어요. 학생 추가는 숙제 > 학급·명단에서도 할 수 있어요.'};
  }
  const cls = await ownedClass(ctx.uid, args.class_id);
  if (args.action === 'add_students') {
    const students = Array.isArray(args.students) ? args.students.map((row: Data) => ({number: Number(row.number), name: String(row.name ?? '').trim()})) : [];
    if (!students.length || students.some((row: {number: number; name: string}) => !Number.isInteger(row.number) || !row.name)) throw new BerryError('학생 번호와 이름(students)을 알려 주세요.');
    return {view: {target: String(cls.name ?? ''), action: '학생 추가', count: students.length, students: students.map((row: {number: number; name: string}) => `${row.number}번 ${row.name}`), note: '입장 코드는 학급 명단 화면에서 확인하세요.'}, calls: [{route: 'api', segments: ['students', cls.id], method: 'POST', body: {students}}], savedNote: `${students.length}명을 추가했어요. 입장 코드는 학급 명단 화면에서 확인하세요.`};
  }
  if (args.action === 'reset_code') {
    const [student] = await studentsByNumber(cls.id, [args.student_number]);
    return {view: {target: `${cls.name ?? ''} · ${student.label}`, action: '입장 코드 다시 만들기', danger: '지금 쓰는 코드는 바로 막히고, 학생은 새 코드로 다시 로그인해야 해요.'}, calls: [{route: 'api', segments: ['reset-code', cls.id, student.id], method: 'POST', body: {}}], savedNote: '새 코드를 만들었어요. 학급 명단 화면에서 확인해 학생에게 알려 주세요.'};
  }
  throw new BerryError('action을 확인해 주세요.');
}

async function workspace(args: Data, ctx: BearerContext, teacher: Context): Promise<ManagePlan> {
  const space = db().doc(`teacherWorkspaces/${ctx.uid}`);
  switch (args.action) {
    case 'edit_event': case 'delete_event': {
      const id = safeId(args.event_id, '일정'), event = (await space.collection('calendar').doc(id).get()).data();
      if (!event) throw new BerryError('이 일정을 찾을 수 없어요.', 404, 'not_found');
      if (event.source === 'assignment' || event.assignmentId) throw new BerryError('숙제 마감 일정은 숙제에서 바꿔 주세요.');
      if (args.action === 'delete_event') return {view: {target: String(event.title ?? '일정'), action: '일정 지우기', start: clock(event.start) ?? event.start, danger: '일정이 지워지고 되돌릴 수 없어요.'}, calls: [{route: 'workspace', segments: ['calendar', id], method: 'DELETE'}], savedNote: '일정을 지웠어요.'};
      // The handler replaces the event, so untouched fields are resent as they are.
      const allDay = bool(args.all_day, 'all_day') ?? event.allDay === true, seoul = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') : value;
      // Moving the start without a new end keeps the event's length, so the end never lands before the start.
      const at = (value: unknown) => typeof value !== 'string' ? NaN : /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00+09:00`) : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value) ? Date.parse(`${value.replace(' ', 'T')}:00+09:00`) : Date.parse(value);
      const length = at(event.end) - at(event.start), shifted = args.start !== undefined && args.end === undefined && Number.isFinite(length) && Number.isFinite(at(args.start)) ? at(args.start) + length : NaN;
      const end = args.end === 'none' ? null : args.end !== undefined ? seoul(args.end) : Number.isFinite(shifted) ? (allDay ? seoulDate(shifted) : new Date(shifted).toISOString()) : event.end ?? null;
      const body = {title: args.title ?? event.title, start: seoul(args.start) ?? event.start, end, allDay, kind: event.kind ?? 'school', classId: event.classId ?? null};
      const changes = [args.title !== undefined && change('제목', event.title, args.title), args.start !== undefined && change('시작', clock(event.start) ?? event.start, args.start), args.end !== undefined && change('끝', clock(event.end) ?? event.end, args.end), args.all_day !== undefined && change('하루 종일', event.allDay === true, allDay)].filter(Boolean);
      if (!changes.length) throw new BerryError('바꿀 내용(title·start·end·all_day)을 알려 주세요.');
      return {view: {target: String(event.title ?? '일정'), action: '일정 고치기', changes}, calls: [{route: 'workspace', segments: ['calendar', id], method: 'POST', body}], savedNote: '일정을 고쳤어요.'};
    }
    case 'edit_item': case 'delete_item': {
      const id = safeId(args.item_id, '항목'), item = (await space.collection('items').doc(id).get()).data();
      if (!item || item.sensitivity === 'sensitive') throw new BerryError('이 항목을 찾을 수 없어요.', 404, 'not_found');
      if (args.action === 'delete_item') return {view: {target: String(item.title ?? '항목'), action: '업무 항목 지우기', danger: '항목과 첨부 파일이 지워지고 되돌릴 수 없어요.'}, calls: [{route: 'workspace', segments: ['items', id], method: 'DELETE'}], savedNote: '항목을 지웠어요.'};
      const current = (await read({route: 'workspace', segments: ['items', id]}, teacher)).item ?? item;
      const body = {folderId: current.folderId, type: current.type, title: args.title ?? current.title, body: args.body ?? current.body ?? '', url: current.url ?? undefined, checklist: current.checklist ?? [], dueAt: args.due_at === 'none' ? null : args.due_at !== undefined ? day(args.due_at, 'due_at') : current.dueAt ?? null, tags: args.tags ?? current.tags ?? [], classId: current.classId ?? null, students: current.students ?? []};
      const changes = [args.title !== undefined && change('제목', current.title, args.title), args.body !== undefined && change('내용', String(current.body ?? '').slice(0, 40), String(args.body).slice(0, 40)), args.due_at !== undefined && change('기한', current.dueAt, body.dueAt), args.tags !== undefined && change('태그', current.tags, args.tags)].filter(Boolean);
      if (!changes.length) throw new BerryError('바꿀 내용(title·body·due_at·tags)을 알려 주세요.');
      return {view: {target: String(current.title ?? '항목'), action: '업무 항목 고치기', changes}, calls: [{route: 'workspace', segments: ['items', id], method: 'POST', body}], savedNote: '항목을 고쳤어요.'};
    }
    case 'delete_folder': {
      const id = safeId(args.folder_id, '폴더'), folder = (await space.collection('folders').doc(id).get()).data();
      if (!folder) throw new BerryError('이 폴더를 찾을 수 없어요.', 404, 'not_found');
      return {view: {target: String(folder.name ?? '폴더'), action: '폴더 지우기', danger: '빈 폴더만 지워져요. 지우면 되돌릴 수 없어요.'}, calls: [{route: 'workspace', segments: ['folders', id], method: 'DELETE'}], savedNote: '폴더를 지웠어요.'};
    }
    case 'save_timetable': {
      if (typeof args.week_key !== 'string' || !/^\d{4}-W\d{2}$/.test(args.week_key)) throw new BerryError('week_key는 2026-W45처럼 보내 주세요.');
      if (typeof args.timetable_text !== 'string' || !args.timetable_text.trim()) throw new BerryError('시간표 내용(timetable_text)을 알려 주세요.');
      return {view: {target: `${args.week_key} 시간표`, action: '시간표 저장', body: args.timetable_text, note: '그 주 시간표 전체가 이 내용으로 바뀌어요.'}, calls: [{route: 'workspace', segments: ['timetable', args.week_key], method: 'POST', body: {text: args.timetable_text}}], savedNote: '시간표를 저장했어요.'};
    }
  }
  throw new BerryError('action을 확인해 주세요.');
}

/**
 * Runs a confirmed plan as the teacher. Each step reports only success or the app's own error message: responses
 * are never passed on, so secrets such as student access codes stay on the server.
 */
export async function executeManage(plan: ManagePlan, ctx: BearerContext) {
  const teacher = await contextForUid(ctx.uid), failed: {step: string; error: string}[] = [];
  let done = 0, previous: {status: number; data: Data} | null = null;
  for (const planned of plan.calls) {
    let call = planned;
    if (planned.chain === 'setId') {
      const set = previous && previous.status < 400 ? previous.data.set : null;
      if (!set?.id) {failed.push({step: planned.label ?? '다음 단계', error: '앞 단계가 저장되지 않아 하지 않았어요.'}); previous = null; continue;}
      call = {...planned, body: {...(planned.body as Data), setId: set.id, ...(Number.isInteger(set.version) ? {expectedVersion: set.version} : {})}};
    }
    const result = await run(call, teacher);
    previous = result;
    if (result.status < 400) {
      const rows = Array.isArray(result.data.results) ? result.data.results as {ok?: boolean; code?: string}[] : null;
      if (rows) {done += rows.filter(row => row.ok).length; for (const row of rows.filter(row => !row.ok)) failed.push({step: call.label ?? '항목', error: String(row.code ?? '실패')});}
      else done += 1;
    } else failed.push({step: call.label ?? call.segments.at(-1) ?? '저장', error: String(result.data.error ?? `저장하지 못했어요(${result.status}).`)});
  }
  if (!done && failed.length) throw new BerryError(failed[0].error, 400, 'invalid_request');
  return {done, failed, note: failed.length ? `${done}건 반영, ${failed.length}건은 반영하지 못했어요.` : plan.savedNote};
}
