/** OAuth scopes a connected client (Berry brain, Claude, ChatGPT) may ask for. Writes come in a later phase. */
export const BERRY_SCOPES = ['classes:read', 'homework:read', 'notebook:read', 'events:read', 'names'] as const;
export type BerryScope = typeof BERRY_SCOPES[number];
export const BERRY_SCOPE_LABELS: Record<BerryScope, {title: string; detail: string; warning?: string}> = {
  'classes:read': {title: '학급·명단', detail: '우리 반 목록과 학생 번호를 읽어요. 이름은 기본적으로 "학생 07"처럼 가명으로 나가요.'},
  'homework:read': {title: '숙제·제출', detail: '숙제 목록, 마감, 미제출·검사 대기 현황을 읽어요. 제출물 본문·사진은 읽지 않아요.'},
  'notebook:read': {title: '교무수첩(요약)', detail: '민감 기록(상담·건강·가정)을 뺀 관찰 기록을 읽어요.'},
  'events:read': {title: '변경 알림', detail: '마감 임박, 검사 대기 같은 변경 이벤트를 읽어요.'},
  names: {title: '학생 실명 반환', detail: '가명 대신 실제 이름을 돌려줘요.', warning: '외부 AI 서비스로 학생 실명이 나갑니다. 안내문처럼 꼭 필요할 때만 켜 주세요.'},
};
export const DEFAULT_SCOPES: readonly BerryScope[] = ['classes:read', 'homework:read', 'events:read'];

export type BerryAccessMode = 'off' | 'allowlist' | 'all';
export type BerryAccessConfig = {mode: BerryAccessMode; teacherUids: string[]};

export type BerryClient = {id: string; name: string; redirectUris: string[]; createdAt: string};
export type BerryGrant = {id: string; clientId: string; clientName: string; scopes: BerryScope[]; createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null};
export type BearerContext = {uid: string; grantId: string; clientId: string; scopes: BerryScope[]};

export type AuthorizeRequest = {clientId: string; redirectUri: string; scopes: BerryScope[]; state: string; codeChallenge: string; resource: string | null};

export type McpTool = {name: string; description: string; inputSchema: Record<string, unknown>; scope: BerryScope};

/** Derived from assignment summaries on each poll. */
export type BerryDerivedEvent = {id: string; type: 'assignment.created' | 'deadline.soon' | 'deadline.passed' | 'review.pending'; source: 'derived'; at: string; classId: string; assignmentId: string; title: string; data: Record<string, number | string | null>};
/** Written by workspace and notebook writes. The summary is generic: no title, body or student name. */
export type BerryLogEvent = {id: string; type: string; source: 'log'; at: string; ref: {collection: string; id: string}; summary: string};
export type BerryEvent = BerryDerivedEvent | BerryLogEvent;
