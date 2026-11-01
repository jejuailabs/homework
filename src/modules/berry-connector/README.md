# 베리 연결 창구 (berry-connector)

ourclass 데이터를 **베리 에이전트 서버, Claude, ChatGPT** 같은 외부 클라이언트가 읽고, 선생님 확인을 거쳐 쓸 수 있게 하는 모듈이다. 0단계는 읽기 전용, 1단계(2026-11)에서 업무 공간 읽기와 2단계 확인 쓰기가 붙었다([BERRY_IMPLEMENTATION_HANDOFF.md](../../../BERRY_IMPLEMENTATION_HANDOFF.md) 2절). 설계 배경은 루트 [AGENT_SECRETARY_PREBRIEF.md](../../../AGENT_SECRETARY_PREBRIEF.md)·[BERRY_UX_AND_APP_PREBRIEF.md](../../../BERRY_UX_AND_APP_PREBRIEF.md)를 따른다.

## 구성

| 경로 | 역할 |
|---|---|
| `GET /.well-known/oauth-authorization-server` | RFC 8414 인가 서버 메타데이터 |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 보호 자원 메타데이터 (`resource` = `/api/mcp`) |
| `POST /api/oauth/register` | RFC 7591 동적 클라이언트 등록. 공개 클라이언트(PKCE)만 |
| `GET /oauth/authorize` | 교사 동의 화면. 범위를 좁히고 접근 기간(7일·14일·30일·6개월·12개월, 서버는 1~365일)을 고른다 |
| `GET/POST /api/oauth/consent` | 동의 화면이 쓰는 검증·승인 API (세션 쿠키) |
| `POST /api/oauth/token` | `authorization_code`(PKCE S256) · `refresh_token`(회전, 재사용 시 연결 전체 해제) |
| `POST /api/oauth/revoke` | RFC 7009 |
| `GET /api/oauth/grants`, `DELETE /api/oauth/grants/{id}` | 교사의 연결 목록·해제 (세션 쿠키) |
| `POST /api/mcp` | MCP Streamable HTTP(JSON-RPC, 무상태). `initialize`·`ping`·`tools/list`·`tools/call` |
| `GET /api/events?since=` | 변경 이벤트 피드. 업무 공간·교무수첩 쓰기 로그(`source: log`, `teacherEvents/{uid}/log`)와 숙제 요약에서 도출한 사실(`source: derived`)을 시간순으로 합친다. 민감 로그는 나가지 않는다 |
| `/teacher/me/connections` | 연결 관리 화면과 연결 안내 |

## 권한 범위

읽기: `classes:read`, `homework:read`, `notebook:read`, `workspace:read`, `events:read`. 실명: `names`. 쓰기: `calendar:write`, `workspace:write`, `notebook:write`.

- 범위를 보내지 않은 요청의 기본값은 `classes:read`, `homework:read`, `workspace:read`, `events:read`(읽기만, 실명 없음).
- `names`와 쓰기 범위는 동의 화면에서 기본 체크 해제이며 선생님이 직접 켠다. 갱신 토큰으로 범위를 넓힐 수 없다.
- 학생은 항상 `학생 07` 가명으로 나가고, 제목·메모·본문에 적힌 실명도 가명으로 바꿔 내보낸다. `names` 범위가 있고 호출이 `reveal_names: true`일 때만 그 응답에서 실명.
- 교무수첩 민감 기록(상담·건강·가정)과 업무 항목 `sensitivity: sensitive`는 어떤 범위로도 나가지 않는다.

## 도구 (읽기)

`list_classes`, `get_roster`, `list_assignments`, `get_missing_submissions`, `get_review_queue`, `list_deadlines`, `search_notebook`, `get_calendar`, `get_timetable`, `get_lesson_log`, `search_workspace`(제목·태그·기한만), `get_work_item`. 각 도구는 소유권을 매번 서버에서 확인하고, 호출마다 `berryAudit`에 기록되며, 연결당 분 60회·교사당 일 2,000회 한도를 둔다.

## 도구 (쓰기, 2단계 확인)

`add_calendar_event`(calendar:write), `add_lesson_log`·`add_work_item`(workspace:write), `add_notebook_entry`(notebook:write)는 저장하지 않고 미리보기와 `confirm_token`(10분, 1회)을 돌려준다. `confirm_write {confirm_token}`이 같은 교사·같은 연결·같은 내용(payload 해시)일 때만 저장한다. 토큰은 해시만 `berryConfirmations/{hash}`에 두고, 미리보기 내용은 교무수첩과 같은 봉투 암호화로 보관한다. 저장된 문서는 `source: 'chat'`, `pending: true`이며 선생님이 화면에서 확정해야 `pending: false`가 된다. 민감 분류가 붙은 교무수첩 기록은 응답에 본문을 돌려주지 않는다.

두뇌는 `confirm_write`를 사용자 승인 버튼에만 연결해야 한다(LLM이 미리보기와 확인을 연속 호출하면 2단계가 무의미해진다).

## 저장소 (서버 전용, 클라이언트 직접 접근 없음)

```
berryClients/{clientId}        등록된 앱 (이름, redirect URI)
berryAuthCodes/{codeHash}      10분짜리 인가 코드, 1회 사용
berryGrants/{grantId}          교사별 연결: scopes, expiresAt(접근 기간), lastUsedAt, revokedAt
berryTokens/{tokenHash}        access(1시간)·refresh(연결 기간) 토큰 해시
berryAudit/{id}                도구 호출 기록 (인자 본문 없음)
berryConfirmations/{hash}      쓰기 미리보기: uid·grantId·clientId·tool·payloadHash, 암호화된 payload, expiresAt(10분), usedAt
rateLimits/berry_*             호출 한도 카운터
featureAccess/berryConnector   {mode: 'off'|'allowlist'|'all', teacherUids: []}
```

토큰 원문은 저장하지 않고 SHA-256 해시만 둔다. Firestore 규칙은 기본 거부를 그대로 쓴다.

## 켜는 방법

1. 운영 환경변수 `BERRY_ISSUER=https://ourclass.co.kr`. 비우면 요청 헤더에서 origin을 추정하므로 운영에서는 꼭 설정한다.
2. Firestore `featureAccess/berryConnector` 문서를 `{mode: 'allowlist', teacherUids: ['<uid>']}`로 만든다. 문서가 없으면 `off`다. 서버 인증 정보가 있는 환경에서 `npm run berry:allow -- --email teacher@example.com`으로 교사를 추가한다(`--remove`로 제외, `--mode all|off`로 모드 변경).
3. Claude 데스크톱·웹의 커넥터 추가에 `https://ourclass.co.kr/api/mcp`를 넣는다. 동적 등록 → 동의 화면 → 토큰 순으로 진행된다.
4. 끄려면 `BERRY_CONNECTOR_DISABLED=true`. 데이터는 지우지 않는다.
5. 로컬 개발에서는 `.env.local`에 `BERRY_CONNECTOR_MODE=all`을 두면 Firestore 문서 없이 열린다. 운영에서는 비워 둔다.

## 아직 없는 것

- 숙제 생성 같은 학급 쓰기 도구. 숙제·제출 이벤트는 계속 도출 방식이다.
- Firestore TTL: `berryConfirmations.expiresAt`(firestore.indexes.json에 포함, 배포 필요)과 기존 `berryTokens`·`berryAuthCodes`.
- 동의 시 최근 로그인 재확인. 지금은 5일 세션 쿠키만 요구한다.
- 토큰 보관 키 회전, 운영자 화면의 연결 집계.
