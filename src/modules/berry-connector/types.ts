/** OAuth scopes a connected client (Berry brain, Claude, ChatGPT) may ask for. Write scopes only ever preview, then save on confirm. */
export const BERRY_SCOPES = ['classes:read', 'homework:read', 'notebook:read', 'workspace:read', 'events:read', 'names', 'calendar:write', 'workspace:write', 'notebook:write', 'classroom:write'] as const;
export type BerryScope = typeof BERRY_SCOPES[number];
export const BERRY_SCOPE_LABELS: Record<BerryScope, {title: string; detail: string; warning?: string}> = {
  'classes:read': {title: '학급·명단', detail: '우리 반 목록과 학생 번호를 읽어요. 이름은 기본적으로 "학생 07"처럼 가명으로 나가요.'},
  'homework:read': {title: '숙제·제출', detail: '숙제 목록, 마감, 미제출·검사 대기 현황을 읽어요. 제출물 본문·사진은 읽지 않아요.'},
  'notebook:read': {title: '교무수첩(요약)', detail: '민감 기록(상담·건강·가정)을 뺀 관찰 기록을 읽어요.'},
  'events:read': {title: '변경 알림', detail: '마감 임박, 검사 대기 같은 변경 이벤트를 읽어요.'},
  'workspace:read': {title: '업무 공간', detail: '일정·시간표·수업 일지와 업무 폴더 항목을 읽어요. 민감 항목은 읽지 않아요.'},
  names: {title: '학생 실명 반환', detail: '가명 대신 실제 이름을 돌려줘요.', warning: '외부 AI 서비스로 학생 실명이 나갑니다. 안내문처럼 꼭 필요할 때만 켜 주세요.'},
  'calendar:write': {title: '일정 추가', detail: '일정을 추가해요. 미리보기 후 확인해야 저장되고, 화면에서 선생님이 확정할 때까지 "베리 제안"으로 남아요.', warning: '쓰기 권한이에요. 필요할 때만 켜 주세요.'},
  'workspace:write': {title: '수업 일지·업무 항목 추가', detail: '수업 일지 한 줄과 업무 폴더 항목을 추가해요. 미리보기 후 확인해야 저장돼요.', warning: '쓰기 권한이에요. 필요할 때만 켜 주세요.'},
  'classroom:write': {title: '숙제방·전시실·참여보드 열기', detail: '우리 반 숙제방(전시실·참여보드 자동 연동 포함), 전시실, 참여보드를 새로 열어요. 미리보기 카드를 확인해 저장해야 열려요.', warning: '저장하면 학생 화면에 바로 보여요. 필요할 때만 켜 주세요.'},
  'notebook:write': {title: '교무수첩 기록 추가', detail: '교무수첩에 기록을 추가해요. 미리보기 후 확인해야 저장되고, 민감 기록은 응답에 본문을 돌려주지 않아요.', warning: '쓰기 권한이에요. 필요할 때만 켜 주세요.'},
};
/** Read-only and name-free. Write scopes and names are never requested by default and start unchecked on the consent screen. */
export const DEFAULT_SCOPES: readonly BerryScope[] = ['classes:read', 'homework:read', 'workspace:read', 'events:read'];
export const WRITE_SCOPES: readonly BerryScope[] = ['calendar:write', 'workspace:write', 'notebook:write', 'classroom:write'];

export type BerryAccessMode = 'off' | 'allowlist' | 'all';
export type BerryAccessConfig = {mode: BerryAccessMode; teacherUids: string[]};

export type BerryClient = {id: string; name: string; redirectUris: string[]; createdAt: string};
export type BerryGrant = {id: string; clientId: string; clientName: string; scopes: BerryScope[]; createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null};
export type BearerContext = {uid: string; role: string; grantId: string; clientId: string; scopes: BerryScope[]};

export type AuthorizeRequest = {clientId: string; redirectUri: string; scopes: BerryScope[]; state: string; codeChallenge: string; resource: string | null};

/** `scope` lists the scopes that unlock the tool; any one of them is enough. */
export type McpTool = {name: string; description: string; inputSchema: Record<string, unknown>; scope: BerryScope | readonly BerryScope[]};

/** Derived from assignment summaries on each poll. */
export type BerryDerivedEvent = {id: string; type: 'assignment.created' | 'deadline.soon' | 'deadline.passed' | 'review.pending'; source: 'derived'; at: string; classId: string; assignmentId: string; title: string; data: Record<string, number | string | null>};
/** Written by workspace and notebook writes. The summary is generic: no title, body or student name. */
export type BerryLogEvent = {id: string; type: string; source: 'log'; at: string; ref: {collection: string; id: string}; summary: string};
export type BerryEvent = BerryDerivedEvent | BerryLogEvent;
