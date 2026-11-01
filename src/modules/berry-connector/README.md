# 베리 연결 창구 (berry-connector)

ourclass 데이터를 **베리 에이전트 서버, Claude, ChatGPT** 같은 외부 클라이언트가 읽을 수 있게 하는 모듈이다. 0단계는 **읽기 전용**이며 쓰기 도구는 다음 단계다. 설계 배경은 루트 [AGENT_SECRETARY_PREBRIEF.md](../../../AGENT_SECRETARY_PREBRIEF.md)·[BERRY_UX_AND_APP_PREBRIEF.md](../../../BERRY_UX_AND_APP_PREBRIEF.md)를 따른다.

## 구성

| 경로 | 역할 |
|---|---|
| `GET /.well-known/oauth-authorization-server` | RFC 8414 인가 서버 메타데이터 |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 보호 자원 메타데이터 (`resource` = `/api/mcp`) |
| `POST /api/oauth/register` | RFC 7591 동적 클라이언트 등록. 공개 클라이언트(PKCE)만 |
| `GET /oauth/authorize` | 교사 동의 화면. 범위를 좁히고 접근 기간(1~30일)을 고른다 |
| `GET/POST /api/oauth/consent` | 동의 화면이 쓰는 검증·승인 API (세션 쿠키) |
| `POST /api/oauth/token` | `authorization_code`(PKCE S256) · `refresh_token`(회전, 재사용 시 연결 전체 해제) |
| `POST /api/oauth/revoke` | RFC 7009 |
| `GET /api/oauth/grants`, `DELETE /api/oauth/grants/{id}` | 교사의 연결 목록·해제 (세션 쿠키) |
| `POST /api/mcp` | MCP Streamable HTTP(JSON-RPC, 무상태). `initialize`·`ping`·`tools/list`·`tools/call` |
| `GET /api/events?since=` | 변경 이벤트 피드. 0단계는 숙제 요약에서 **도출**한다 (`source: derived`) |
| `/teacher/me/connections` | 연결 관리 화면과 연결 안내 |

## 권한 범위

`classes:read`, `homework:read`, `notebook:read`, `events:read`, `names`. 기본 요청은 앞의 세 개다. `names`는 실명 반환이며 동의 화면에서 경고와 함께 별도 체크해야 한다. 그 외에는 학생이 항상 `학생 07` 형태의 가명으로 나간다. 교무수첩의 민감 기록(상담·건강·가정)은 어떤 범위로도 나가지 않는다.

## 도구 (읽기)

`list_classes`, `get_roster`, `list_assignments`, `get_missing_submissions`, `get_review_queue`, `list_deadlines`, `search_notebook`. 각 도구는 소유권을 매번 서버에서 확인하고, 호출마다 `berryAudit`에 기록되며, 연결당 분 60회·교사당 일 2,000회 한도를 둔다.

## 저장소 (서버 전용, 클라이언트 직접 접근 없음)

```
berryClients/{clientId}        등록된 앱 (이름, redirect URI)
berryAuthCodes/{codeHash}      10분짜리 인가 코드, 1회 사용
berryGrants/{grantId}          교사별 연결: scopes, expiresAt(접근 기간), lastUsedAt, revokedAt
berryTokens/{tokenHash}        access(1시간)·refresh(연결 기간) 토큰 해시
berryAudit/{id}                도구 호출 기록 (인자 본문 없음)
rateLimits/berry_*             호출 한도 카운터
featureAccess/berryConnector   {mode: 'off'|'allowlist'|'all', teacherUids: []}
```

토큰 원문은 저장하지 않고 SHA-256 해시만 둔다. Firestore 규칙은 기본 거부를 그대로 쓴다.

## 켜는 방법

1. 운영 환경변수 `BERRY_ISSUER=https://ourclass.co.kr`. 비우면 요청 헤더에서 origin을 추정하므로 운영에서는 꼭 설정한다.
2. Firestore `featureAccess/berryConnector` 문서를 `{mode: 'allowlist', teacherUids: ['<uid>']}`로 만든다. 문서가 없으면 `off`다.
3. Claude 데스크톱·웹의 커넥터 추가에 `https://ourclass.co.kr/api/mcp`를 넣는다. 동적 등록 → 동의 화면 → 토큰 순으로 진행된다.
4. 끄려면 `BERRY_CONNECTOR_DISABLED=true`. 데이터는 지우지 않는다.
5. 로컬 개발에서는 `.env.local`에 `BERRY_CONNECTOR_MODE=all`을 두면 Firestore 문서 없이 열린다. 운영에서는 비워 둔다.

## 아직 없는 것

- 쓰기 도구(`add_notebook_entry`, `create_homework` …)와 미리보기→확인 2단계.
- 쓰기 측 이벤트 로그. 지금 피드는 폴링마다 숙제 요약에서 계산한다.
- 동의 시 최근 로그인 재확인. 지금은 5일 세션 쿠키만 요구한다.
- 토큰 보관 키 회전, 운영자 화면의 연결 집계.
