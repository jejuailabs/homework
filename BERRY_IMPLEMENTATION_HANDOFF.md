# 베리 구현 인계 명세 (1·2단계)

2026-11-01. 0단계(연결 창구)가 운영에 올라간 상태에서, 다음 단계를 **설계 재논의 없이 구현**할 수 있도록 적은 명세다. 원론은 [AGENT_SECRETARY_PREBRIEF.md](AGENT_SECRETARY_PREBRIEF.md), 화면·앱 구조는 [BERRY_UX_AND_APP_PREBRIEF.md](BERRY_UX_AND_APP_PREBRIEF.md), 0단계 구현은 [src/modules/berry-connector/README.md](src/modules/berry-connector/README.md).

## 0. 현재 상태 (2026-11-01 기준)

- 운영 ourclass.co.kr에 `/api/oauth/*`, `/api/mcp`, `/api/events`, `/oauth/authorize`, `/teacher/me/connections`가 배포됐다. Claude 데스크톱 커넥터로 연결해 읽기 도구 7종이 모두 동작함을 확인했다.
- `featureAccess/berryConnector`는 `allowlist`, 교사 1명(jejuailabs). 추가는 `npm run berry:allow -- --email <교사>`.
- 보안 자체 점검 후 보강(등록 요청 제한, 코드 재사용 시 연결 해제, 미확인 앱 경고)을 PR로 올렸다.
- 운영 숙제: Vercel 환경변수 `BERRY_ISSUER=https://ourclass.co.kr`(미설정, 헤더 추정으로 동작 중), Firestore TTL 정책을 `berryTokens.expiresAt`·`berryAuthCodes.expiresAt`·`rateLimits.expiresAt`에 설정(콘솔), Next.js 보안 업그레이드 권고 1건(빌드 시 표시, 별도 작업), `featureAccess/teacherNotebook` 문서가 운영에 없어 교무수첩이 아직 모든 교사에게 "준비 중"임.
- GitHub `jejuailabs/berry`(비공개)가 비어 있다. 두뇌·앱은 여기에 만든다.

## 1. 바꾸면 안 되는 불변 조건

구현 중 아래가 깨지면 기능이 아니라 사고다. 테스트로 증명한 뒤 병합한다.

1. **원본은 ourclass에만.** 베리 두뇌는 요약·색인·대화·알림만 저장한다. 학생 실명·교무수첩 본문·제출물 본문을 두뇌 DB에 쓰지 않는다.
2. **가명 기본.** 외부(두뇌·LLM·푸시)로 나가는 학생은 `학생 07`. 실명은 `names` 범위가 있고 호출이 `reveal_names: true`일 때만, 응답 단위로.
3. **민감 기록은 어떤 경로로도 나가지 않는다.** 교무수첩 `sensitive=true`(상담·건강·가정·학부모 연락)는 MCP·이벤트·색인·브리핑·푸시 모두에서 제외. 1단계 신규 컬렉션의 `sensitivity: 'sensitive'`도 동일.
4. **쓰기는 2단계.** 모든 쓰기 도구는 `preview`(저장 없음, 확인 토큰 반환) → `confirm`(토큰으로 실제 저장). 토큰은 10분, 1회, 교사·클라이언트·내용 해시에 묶인다.
5. **소유권은 매 호출 서버에서.** `classId`·`studentId`·`assignmentId`는 호출마다 `ownerUid === uid`를 확인한다. 클라이언트가 보낸 ID를 신뢰하지 않는다.
6. **서버 전용 저장소.** 신규 Firestore 컬렉션은 규칙 기본 거부 그대로. 클라이언트 SDK 직접 접근 없음.
7. **푸시 본문 일반화.** "확인할 기록 1건", "마감 2일 전 항목 1건". 학생 이름·본문·숙제 제목도 넣지 않는다.
8. **비밀값은 커밋하지 않는다.** Vercel/Cloud Run/Supabase 환경변수로만.

## 2. 1단계: ourclass 원천 확장 (이 저장소)

### 2.1 범위

시간·학습·자료 도메인만. 생활·소통·행정(상담·연락·공문·회의)은 2단계 이후.

| 컬렉션 | 문서 | 필수 필드 |
|---|---|---|
| `teacherWorkspaces/{uid}` | 공간 메타 | `createdAt`, `storageBytes`, `retentionDays`(기본 365) |
| `…/calendar/{eventId}` | 일정 | `title`(≤120), `start`·`end`(ISO, Asia/Seoul 해석), `allDay`, `kind`('school'\|'lesson'\|'meeting'\|'personal'\|'deadline'), `classId?`, `source`('form'\|'import'\|'chat'\|'activity'), `sensitivity`('normal'), `createdAt`, `updatedAt` |
| `…/timetable/{weekKey}` | 주간 시간표 | `weekKey`('2026-W45'), `slots[]`: `{day:1-5, period:1-7, subject, room?, classId?}`, `source` |
| `…/lessons/{date}` | 수업 일지 | `date`('YYYY-MM-DD'), `entries[]`: `{period?, subject, unit?, note(≤500)}`, `source`, `updatedAt` |
| `…/folders/{folderId}` | 업무 폴더 | `name`(≤80), `kind`('class'\|'admin'\|'assessment'\|'event'\|'training'\|'etc'), `parentId?`, `createdAt` |
| `…/items/{itemId}` | 폴더 항목 | `folderId`, `type`('note'\|'file'\|'checklist'\|'link'), `title`(≤120), `body`(암호화 봉투, ≤8000자), `filePath?`, `checklist?[]`, `dueAt?`, `tags[]`, `classId?`, `students[]`(선택), `sensitivity`, `source`, `createdAt`, `updatedAt` |
| `teacherEvents/{uid}/log/{eventId}` | 쓰기 측 이벤트 로그 | `type`, `at`, `ref`(컬렉션·문서), `summary`(실명·본문 없음) |

- `body` 암호화는 `src/modules/teacher-notebook/vault.ts`의 `sealBody/openBody`와 같은 봉투 방식. 키 파생 라벨만 `teacher-workspace-item`으로 바꾼다. AAD는 `[label, uid, itemId]`.
- 파일은 기존 `uploads` 예약·확정·정리 흐름과 교사별 용량 예산(`teacher-storage.ts`)을 재사용. 새 Storage 경로 `workspace/{uid}/{itemId}/{fileId}`.
- 모든 쓰기 API는 `teacherEvents` 로그에 한 줄을 남긴다. 0단계의 `deriveEvents`(숙제 요약 도출)는 유지하되, `/api/events`는 로그 + 도출을 합쳐 돌려주고 `source: 'log'|'derived'`로 표시한다.

### 2.2 API (세션 쿠키, `/api/workspace/[[...segments]]`)

`src/modules/teacher-workspace/` 모듈로 격리. 라우트 파일은 교무수첩과 같은 3줄 패턴.

| 경로 | 메서드 | 동작 |
|---|---|---|
| `calendar?from&to` | GET | 기간 일정 + 같은 기간 숙제 마감(`assignments.dueAt`)을 `kind:'deadline'`으로 합쳐 반환 |
| `calendar` / `calendar/{id}` | POST / POST / DELETE | 생성 / 수정 / 삭제 |
| `calendar/import` | POST | ICS 또는 CSV(제목,시작,끝,종류). 최대 500건, 미리보기 후 확정 2단계 |
| `timetable/{weekKey}` | GET / POST | 조회 / 저장(붙여넣기 텍스트 파서 포함: 탭·쉼표 구분 5×7) |
| `lessons?from&to` / `lessons/{date}` | GET / POST | 기간 조회 / 날짜 저장 |
| `folders`, `folders/{id}` | GET / POST / DELETE | 트리 조회 / 생성·이름·이동 / 삭제(항목 있으면 거부) |
| `items?folderId&q&dueBefore` | GET | 목록(본문 제외, 제목·태그·기한만) |
| `items`, `items/{id}` | POST / GET / POST / DELETE | 생성 / 본문 포함 조회 / 수정 / 삭제 |
| `items/{id}/file` | POST | 업로드 예약(기존 uploads 계약) |
| `export?format=csv\|zip` | GET | 일정·일지·항목 CSV, 파일 ZIP. 감사 로그 |

- 정책 함수는 `policy.ts`에 순수 함수로 두고 `policy.test.ts`로 검증한다(날짜·주차·시간표 파서·ICS 파서·용량 계산). 서버 코드는 `server.ts`.
- 환경변수 `TEACHER_WORKSPACE_DISABLED=true`로 전체 중지. 데이터 보존.

### 2.3 화면 (`/teacher/me/workspace`)

- 탭 4개: 일정(월·주), 시간표(주), 수업 일지(날짜 목록 + 한 줄 입력), 업무 폴더(좌 트리·우 목록).
- 마이페이지 카드에 링크 추가(교무수첩·외부 연결과 같은 `mp-card`).
- 베리 챗봇이 넣은 항목(`source:'chat'`)은 "🍇 베리 제안" 배지와 [확정] 버튼. 확정 전에는 `pending:true`로 저장하고 목록에서 구분한다.
- 모바일 390px에서 가로 스크롤 없이.

### 2.4 MCP 도구 추가 (`src/modules/berry-connector/tools.ts`)

읽기: `get_calendar(from,to)`, `get_timetable(week_key)`, `get_lesson_log(from,to)`, `search_workspace(query?, folder_kind?, due_before?)`(제목·태그·기한만, 본문은 `get_work_item(item_id)`로 별도).

쓰기(2단계 확인): `add_calendar_event`, `add_lesson_log`, `add_work_item`, `add_notebook_entry`. 공통 계약:

```
tools/call add_lesson_log {date, subject, note}            → {preview: {...}, confirm_token, expires_in: 600}
tools/call confirm_write {confirm_token}                   → {saved: {collection, id}}
```

- `confirm_token` = 랜덤 32바이트, Firestore `berryConfirmations/{hash}`에 `{uid, grantId, tool, payloadHash, expiresAt, usedAt}`. 다른 연결·다른 교사·다른 내용이면 거부.
- 새 범위: `workspace:read`, `workspace:write`, `notebook:write`, `calendar:write`. 기본 요청 범위는 읽기만. 쓰기 범위는 동의 화면에서 기본 체크 해제.
- 쓰기로 생긴 문서는 `source:'chat'`, `pending:true`. 화면에서 교사가 확정해야 `pending:false`.
- `add_notebook_entry`는 교무수첩 `entryInput` 검증을 그대로 쓰고, 민감 태그가 들어오면 `sensitive:true`로 저장하되 응답에는 본문을 되돌려주지 않는다.

### 2.5 완료 기준

- 정책 테스트: 파서·날짜·확인 토큰·범위 축소 불변 조건. `npm test` 전체 통과.
- 통합 검사(로컬 에뮬레이터 또는 QA 학급): 일정 20건 가져오기 → 캘린더에 숙제 마감 겹침 → 일지 10일 입력 → 항목 20건·파일 3개 → CSV/ZIP 내보내기 → MCP `get_calendar`·`search_workspace` 결과 일치 → `add_lesson_log` 미리보기만으로는 저장 안 됨 → confirm 후 저장·`pending:true` 확인.
- 교사 1명 1개월 실사용 후 다음 단계.

## 3. 2단계: 베리 두뇌 (jejuailabs/berry)

### 3.1 저장소

```
berry/                          pnpm workspaces, Node 24, TypeScript strict
├─ apps/brain/                  Hono + Cloud Run (서울). Dockerfile 포함
├─ apps/mobile/                 Expo (3단계에서 채움, 지금은 빈 뼈대)
├─ packages/shared/             도구 스키마·범위 상수·타입 (ourclass와 복제 아님: 연결 계약만)
├─ packages/mcp-client/         OAuth 토큰 갱신 + MCP Streamable HTTP 클라이언트
└─ infra/                       Cloud Run·Scheduler·Tasks·Secret Manager (terraform 또는 gcloud 스크립트)
```

### 3.2 저장소(Supabase Postgres + pgvector)

```sql
users            (uid pk, email, display_name, created_at, settings jsonb)          -- uid = Firebase UID
connections      (id pk, uid fk, kind 'ourclass'|'google_calendar'|'mail', access_token_enc, refresh_token_enc, scopes text[], expires_at, revoked_at)
conversations    (id pk, uid fk, surface 'web'|'app', created_at, last_message_at, summary text)
messages         (id pk, conversation_id fk, role, content jsonb, tool_calls jsonb, created_at)     -- 30일 후 삭제, summary만 유지
memories         (id pk, uid fk, kind 'profile'|'episode'|'fact', text, embedding vector(1536), confirmed bool, created_at, forget_at)
index_chunks     (id pk, uid fk, source 'ourclass:item'|'ourclass:lesson'|..., ref text, summary text, embedding vector(1536), sensitivity, updated_at)
reminders        (id pk, uid fk, fire_at timestamptz, rrule text, title_generic text, payload jsonb, status, task_name)
jobs             (id pk, uid fk, kind, status, input jsonb, output jsonb, created_at, finished_at)
access_log       (id pk, uid fk, action, target, surface, at)
push_tokens      (uid fk, token, platform, updated_at)
```

- 토큰·본문은 교사별 키로 봉투 암호화(KMS 또는 Supabase Vault). 실명·민감 본문은 어느 테이블에도 없다.
- RLS는 쓰지 않는다. 두뇌 서버만 서비스 키로 접근. 앱·웹 창은 두뇌 API만 호출한다.

### 3.3 에이전트 루프

```
POST /chat {conversation_id?, text, surface, context?: {route, assignmentId?}}  → SSE
  1. 메시지 저장 → 최근 대화 요약 + 관련 memories/index_chunks 검색(top 8)
  2. LLM(도구 호출 가능): 도구 = ourclass MCP tools + set_reminder + list_schedule + remember + forget
  3. 도구 호출 12회·45초 한도. 읽기는 즉시 실행
  4. 쓰기 도구는 MCP preview → 카드로 사용자에게 → 사용자가 [저장] 누르면 confirm 호출
  5. 응답 스트리밍, 접근 로그 1줄
```

- 정책 게이트(코드): 가명 유지(실명 요청은 사용자 명시 + names 범위 필요), 민감 제외, 쓰기 확인, 푸시 본문 일반화, 교사당 일일 한도(브리핑·예약 작업 제외).
- LLM 공급자: 1차 OpenAI Responses API(gpt-6-luna) 재사용. 키는 두뇌 전용. 외부로 나가는 입력은 요약·가명.

### 3.4 선제 규칙과 스케줄러

| 규칙 | 트리거 | 기본 |
|---|---|---|
| 아침 브리핑 | 교사 설정 시각(기본 07:10) | 켜짐 |
| 마감 임박 | `/api/events` `deadline.soon` | 켜짐 |
| 검사 대기 | `review.pending ≥ 5` | 켜짐 |
| 일지 미작성 | 17:00에 `get_lesson_log(today)` 비어 있음 | 켜짐 |
| 일정 충돌 | `get_calendar` 겹침 | 켜짐 |

- Cloud Scheduler 1분 tick → `/internal/tick`(서비스 토큰): 교사별 `/api/events?since=cursor` 당기기(파일럿 ≤ 50명까지는 폴링, 그 뒤 Pub/Sub), 규칙 평가, 발송.
- 정확 시각 알림은 Cloud Tasks 1건 = reminders 1행. 앱 로컬 알림과 중복되면 앱이 `reminder.id`로 제거.
- 조용 시간 기본 21:00~07:00. 조용 시간의 알림은 다음 아침 브리핑에 합친다.

### 3.5 API 표면

| 경로 | 호출자 | 인증 |
|---|---|---|
| `POST /chat`, `GET /conversations`, `GET /inbox`, `POST /inbox/{id}/approve` | 앱, ourclass 웹 창(프록시) | Firebase ID 토큰(앱) / 서비스 토큰 + uid(웹 프록시) |
| `GET/POST /reminders`, `GET/DELETE /memories`, `GET /access-log` | 앱·웹 창 | 동일 |
| `POST /connections/ourclass/start` → OAuth 리다이렉트, `/connections/ourclass/callback` | 앱 | 동일 |
| `POST /internal/tick`, `POST /internal/jobs/{id}` | Scheduler·Tasks | OIDC 서비스 토큰 |
| `POST /push/register` | 앱 | Firebase ID 토큰 |

- ourclass 쪽에는 `/api/berry/chat`·`/api/berry/inbox` 프록시와 `src/modules/berry-panel/`(라즈베리 버튼·패널)만 추가. 두뇌 주소와 서비스 토큰은 서버 환경변수.

### 3.6 완료 기준

- 단위: 게이트 테스트(가명 치환, 민감 제외, 쓰기 확인 없으면 저장 0건, 푸시 본문에 이름 0건).
- 통합: Claude 없이 두뇌 단독으로 "어제 미제출 + 안내문 초안" 시나리오 → 안내문이 가명으로 나오고, 실명 전환은 서버에서만 일어남.
- 선제: QA 학급에 마감 24시간 전 숙제를 만들면 tick 2회 안에 `deadline.soon` 알림이 inbox에 생김.
- 부하: 교사 50명 시뮬레이션에서 tick 1회가 10초 이내.

## 4. 순서와 책임

1. (Opus) 1단계 2.1~2.3 구현 → PR → Fable 리뷰(불변 조건 1·3·5·6) → 병합.
2. (Opus) 2.4 MCP 읽기 4종 + 쓰기 2단계 + 새 범위 → PR → Fable 리뷰(불변 조건 2·4) → 병합.
3. (사용자) Supabase 프로젝트 `berry-brain`(서울), Cloud Run 사용 GCP 프로젝트 결정, 두뇌용 OpenAI 키, Expo·Apple·Google Play 계정.
4. (Opus) 3.1~3.5 두뇌 v1 → 통합 검사 → Fable 리뷰(게이트 전체).
5. 그 다음 웹 창 → 앱 v0 순서는 BERRY_UX_AND_APP_PREBRIEF.md 14절.

## 5. Fable이 남기는 판단

- **MCP가 두뇌의 유일한 데이터 길이어야 한다.** 두뇌가 Firestore를 직접 읽고 싶어지는 순간이 오지만, 그러면 가명화·민감 제외·감사가 한 곳(ourclass API)에서 두 곳으로 갈라진다. 속도가 필요하면 MCP 도구를 늘려라.
- **쓰기 확인 토큰은 LLM이 아니라 사용자 버튼에서 온다.** LLM이 preview와 confirm을 연속 호출하게 두면 2단계는 장식이다. 두뇌는 confirm 호출을 사용자 승인 이벤트에만 연결한다.
- **이벤트 피드는 지금 도출 방식이 맞다.** 쓰기 측 로그는 1단계 신규 컬렉션부터만 남기고, 숙제·제출은 기존 코드를 건드리지 않고 도출로 둔다.
- **교사 간 조율·학부모 공개는 3단계 전에 설계 리뷰를 다시 받는다.** 민감 범주 경계가 바뀌는 유일한 지점이다.
