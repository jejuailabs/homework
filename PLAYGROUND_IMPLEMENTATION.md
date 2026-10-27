# 말놀이터 — 넌센스·오늘의 국어·맞춤법과 대결 모드 구현 명세

> 초기 기획 명세다. 2026-10-27 로컬 구현 범위, 확정한 마감·기권 규칙, 210문항 초안과 남은 검수·이미지·운영 반영 작업은 [모듈 구현 안내](src/modules/playground/README.md)를 따른다. 아래의 비용 추산과 TTL 계획은 운영 적용을 승인하거나 완료했다는 뜻이 아니다.

기준일 2026-10-27. 아직 구현 전이다. 아이들이 쉬는 시간에 들어와서 노는 학생용 공간을 만든다. 혼자 풀기로 시작하고, 1:1 대결, 2~4명이 순발력을 겨루는 방, 교사가 진행하는 팀전으로 넓힌다. 이 문서는 현재 저장소 구조에서 무엇을 재사용하고 어디에 새로 둘지를 정한다. 이미지는 직접 만들지 않으며, 필요한 에셋 목록과 생성 프롬프트는 [docs/playground-prompts.json](docs/playground-prompts.json)에 둔다.

## 1. 한눈에 보기

| 메뉴 | 내용 | 혼자 | 1:1 | 2~4인 순발력 | 팀전 |
|---|---|---|---|---|---|
| **넌센스** | 말장난 문제 → 힌트 → 정답 → "왜 웃긴지" 설명 | ○ | ○ | ○ | ○ |
| **수수께끼** | 특징을 듣고 사물·동물 맞히기 | ○ | ○ | ○ | ○ |
| **오늘의 국어** | 뜻 설명을 보고 단어 맞히기. 초성 힌트를 단계적으로 공개 | ○ | ○ | ○ | ○ |
| **맞춤법** | 맞는 표기 고르기, 틀린 곳 찾기. 자주 틀린 것을 복습 | ○ | ○ | ○ | ○ (주 1회 실력발휘) |

- 모든 메뉴가 하나의 **문제은행 형식**(§3)을 쓴다. 메뉴와 모드는 화면과 점수 규칙만 다르다.
- **혼자 풀기**는 텍스트 입력도 허용한다. **실시간 대결 모드는 보기 고르기와 O/X만** 쓴다. 저학년은 타자가 느려서, 입력식으로 속도를 겨루면 실력이 아니라 타자 속도 대결이 되기 때문이다.
- 대화·채팅 기능은 두지 않는다. 대결 중 반응은 고정 이모지 4종(👍 😮 😂 🔥)만 보낼 수 있다.

## 2. 현재 구조와의 연결

| 필요한 것 | 재사용할 기존 코드 | 방식 |
|---|---|---|
| 모듈 경계 | `src/modules/*` 독립 모듈 관례, [src/modules/README.md](src/modules/README.md) | 새 폴더 `src/modules/playground/`. 모듈 밖에는 얇은 연결 파일만 둔다 |
| 학생·교사 인증 | [auth.ts](src/lib/server/auth.ts)의 `getContext`, `requireStudent`, `requireTeacher`, `assertOrigin` | 변경 API마다 학생 연결·비활성 상태·`authVersion`을 다시 확인 |
| API 라우팅 | `api/daily-quiz/[[...segments]]/route.ts`처럼 하나의 catch-all | `src/app/api/playground/[[...segments]]/route.ts` → `handlePlayground(request, segments)` |
| 학년·날짜 | `daily-quiz`의 서버 한국 날짜와 학급 학년 사용 규칙 | 학생 입력으로 학년·날짜를 바꿀 수 없음 |
| 복습 간격 | [engine.ts](src/modules/daily-quiz/engine.ts)의 1·3·7일, 최대 30일 규칙 | 맞춤법 복습에만 적용. 엔진 함수를 import하고 수정하지 않음 |
| 주간 순위 | `dailyQuizScores/{weekStart}`와 `QuizRank`(동점은 공동 순위, 다른 반 비공개) | 같은 형태로 `playgroundScores/{weekStart}`를 별도로 둠 |
| 보말 지급 | [points.ts](src/lib/server/points.ts), `PointLedgerEntry.source` | `source`에 `'playground'` 추가. 지급 트랜잭션·고정 장부 ID 원칙은 daily-quiz와 같음 |
| 실시간 동기화 | 함께캔버스: [canvases.ts](src/lib/server/canvases.ts)의 `readerGrants` + [use-shared-canvas.ts](src/components/use-shared-canvas.ts)의 `onSnapshot` + [firestore.rules](firestore.rules)의 `classCanvases` 블록 | 같은 방식으로 `playRooms`를 둠(§6). 쓰기는 서버 API만, 클라이언트는 짧은 만료의 읽기 권한으로 구독만 |
| 학생 캐릭터 | `CharacterAvatar`, 나의 작은 세상 착용 상태 | 대기실·순위·결과 화면의 플레이어 표시에 그대로 사용 |
| 메뉴 | [app-shell.tsx](src/components/app-shell.tsx)의 데일리 퀴즈 링크 옆 | `말놀이터` 링크 1개. 플래그가 꺼져 있으면 숨김 |
| 기능 플래그 | `MY_SPACE_DISABLED` 패턴 | `PLAYGROUND_DISABLED=true`면 메뉴를 숨기고 API는 404. `PLAYGROUND_LIVE_DISABLED=true`면 실시간 모드만 끔. 저장된 자료는 그대로 둠 |

### 모듈 폴더

```
src/modules/playground/
  types.ts            문제·회차·방·점수 타입
  bank/               버전이 붙은 기본 문제은행 (bank-v1)
    nonsense.ts  riddle.ts  vocab.ts  spelling.ts
  engine.ts           정답 정규화, 초성 생성, 문제 선택, 점수 계산 (순수 함수)
  engine.test.ts
  room-machine.ts     실시간 방 상태 전이 (순수 함수)
  room-machine.test.ts
  server.ts           handlePlayground: 혼자 풀기·교사 관리·순위 API
  rooms-server.ts     실시간 방 API (생성·참가·답안·진행·하트비트)
  client.ts           fetch 래퍼
  use-play-room.ts    onSnapshot 구독과 서버 시계 보정 훅
  hub.tsx             학생 첫 화면
  solo.tsx            혼자 풀기
  room.tsx            1:1·2~4인 대기실과 게임 화면
  live-host.tsx       교사 진행 화면 (프로젝터용)
  teacher.tsx         교사 설정·문제 관리·맞춤법 목록
  styles.css
  run-tests.mjs
```

### 모듈 밖에 두는 연결 파일

| 파일 | 역할 |
|---|---|
| `src/app/student/playground/page.tsx` | 허브 |
| `src/app/student/playground/[kind]/page.tsx` | 혼자 풀기 (`nonsense`·`riddle`·`vocab`·`spelling`) |
| `src/app/student/playground/room/[code]/page.tsx` | 대결방 |
| `src/app/teacher/playground/page.tsx` | 교사 설정·문제·맞춤법 목록·팀전 열기 |
| `src/app/teacher/playground/live/[roomId]/page.tsx` | 교사 진행 화면 |
| `src/app/api/playground/[[...segments]]/route.ts` | API 진입점 |
| `src/components/app-shell.tsx` | 메뉴 링크 1줄 |
| `src/lib/points-types.ts` | `source`에 `'playground'` 추가 |
| `firestore.rules` | `playRooms` 읽기 블록 **추가** (기존 블록은 고치지 않음) |
| `src/lib/server/run-tests.mjs` | 모듈 테스트 연결 |

## 3. 문제은행

```ts
type PlayKind = 'nonsense' | 'riddle' | 'vocab' | 'spelling';
type PlayItem = {
  id: string;                 // 'nonsense-0001', 교사 문제는 't_{hash}'
  kind: PlayKind;
  gradeBand: 'low' | 'mid' | 'high';   // 1~2 / 3~4 / 5~6학년
  prompt: string;             // 문제 문장 (vocab은 뜻 설명)
  answers: string[];          // 인정하는 답. 첫 번째가 대표 정답
  choices?: string[];         // 보기 4개 (대표 정답 포함). 실시간 모드에는 반드시 있어야 함
  hints: string[];            // 0~2개. vocab은 비워 두면 초성을 자동으로 만듦
  reveal: string;             // 정답 뒤에 보여 주는 설명 ("'배'가 두 가지 뜻이라서")
  tags?: string[];            // 동음이의어, 받침, 띄어쓰기 등
  source: 'bank' | 'teacher' | 'ai-approved';
};
```

- **정답 판정**은 `engine.ts`의 `normalizeAnswer`로 한다. 앞뒤 공백·문장부호·물결표를 지우고, 띄어쓰기는 무시한다. **단, 맞춤법 문제는 띄어쓰기를 무시하지 않는다.** 틀린 띄어쓰기가 바로 문제일 수 있기 때문이다. 그다음 `answers` 중 하나와 같으면 정답이다.
- **초성 힌트**: `engine.ts`의 `chosung('그릇') → 'ㄱㄹ'`. 오늘의 국어는 1단계 글자 수, 2단계 초성, 3단계 첫 글자 공개 순서로 힌트를 준다.
- **보기 섞기**: 학생·문제·날짜로 시드를 만들어 보기 순서를 섞는다. 같은 학생이 다시 들어와도 순서는 같지만, 학생마다 다르다. 그래서 "3번이 답"처럼 답을 돌려도 소용이 없다.
- **기본 은행** `bank-v1`은 직접 검수한 고정 목록이다. 1단계 목표는 넌센스·수수께끼·국어 각각 학년대별 60개, 맞춤법 120개다. 문제 ID는 바꾸지 않고, 고칠 때는 버전을 올린다. 지난 기록은 문제 ID로 연결되므로 보존된다.
- **교사 문제** `classes/{classId}/playgroundItems/{itemId}`: 교사가 직접 입력한다. 해당 반에서만 쓰인다.
- **AI 초안**(5단계, 선택): 기존 `ai.ts`의 교사 할당량과 정책을 써서 초안을 만든다. 저장 상태는 `draft`이고, 교사가 승인한 것만 `ai-approved`로 출제된다. 학생에게 AI 생성 문제가 바로 나가지 않는다. 한국어 말장난은 생성 품질이 들쭉날쭉하기 때문이다.

## 4. 혼자 풀기

### 흐름
1. 허브에서 메뉴를 고른다 → `POST /api/playground/solo/{kind}/next` → 서버가 학년대에 맞는 아직 안 푼 문제 1개를 고른다. 정답·설명은 보내지 않는다.
2. 학생이 답을 내거나 힌트를 연다 → `POST .../answer` (`{itemId, answer, hintsUsed}`).
3. 서버가 판정하고, 정답·설명(`reveal`)을 돌려준다. 정답을 이미 확인한 문제는 다시 풀어도 연습으로만 기록한다.

### 점수 (주간 순위용)
- **처음 푼 결과만 점수로 친다.** 힌트 없이 정답이면 10점, 힌트 1개를 쓰고 정답이면 7점, 2개 이상이면 4점, 오답은 0점이다. 오답 뒤에 다시 시도할 수 있지만 점수는 0점이다.
- **하루 상한**: 점수가 붙는 문제는 하루 30개까지다. 그 뒤는 연습으로 기록한다. 오래 붙잡고 있는 아이보다 꾸준히 오는 아이가 앞서게 하려는 것이다.
- 맞춤법은 오답·"헷갈려요"를 daily-quiz와 같은 간격으로 복습에 넣는다. 복습 문제는 허브에 "다시 볼 맞춤법 N개"로 보여 준다.

### 저장
| 경로 | 내용 |
|---|---|
| `classes/{c}/students/{s}/playgroundYears/{schoolYear}/attempts/{itemId}` | 처음 푼 답·정오·힌트 수·점수·시각. 이미 있으면 덮어쓰지 않음 |
| `.../playgroundYears/{schoolYear}/days/{date}` | 그날 점수가 붙은 문제 수(하루 상한), 지급한 보말 |
| `.../playgroundYears/{schoolYear}/spelling/{itemId}` | 맞춤법 복습 일정 (`QuizSkill`과 같은 필드) |
| `classes/{c}/students/{s}/playgroundScores/{weekStart}` | 주간 점수: 혼자 풀기 점수, 대결 승·무·패, 참여 판 수 |

답안·하루 집계·주간 점수·보말 장부를 **한 트랜잭션**으로 저장한다. 같은 요청을 다시 보내도 결과는 한 번만 반영된다(장부 ID는 `playground_{date}_{itemId}`처럼 고정).

## 5. 대결 모드 규칙

| 모드 | 인원 | 만드는 사람 | 문제 | 점수 |
|---|---|---|---|---|
| **1:1 대결** | 2명 | 학생 | 7문제, 문제당 15초 | 정답이면 500 + 남은 시간 비율 × 500. 둘 다 끝까지 풀고 총점 비교 |
| **순발력 방** | 2~4명 | 학생 | 10문제, 문제당 10초 | 가장 먼저 맞힌 순서대로 100·70·50·40. **오답이면 그 문제는 다시 못 누름** |
| **팀전** | 반 전체, 2~6팀 | 교사 | 교사가 정한 수, 문제당 10~30초 | 개인 점수는 1:1과 같은 공식. **팀 점수는 팀원 점수의 평균**(인원이 달라도 공정) |

- **모든 대결은 같은 반 학생끼리만** 한다. 다른 반 이름은 보이지 않는다.
- **방 참가**: 방을 만든 학생에게 숫자 4자리 코드를 보여 준다. 같은 반에서만 통한다. 허브에는 "지금 같이 놀 수 있는 친구"(최근 30초 안에 접속한 같은 반 학생)를 보여 주고, 초대 버튼으로 초대를 보낼 수 있다. 초대는 받은 학생이 수락해야 참가된다.
- **문제 범위**: 방을 만들 때 메뉴(넌센스·수수께끼·국어·맞춤법·섞기)를 고른다. 학년대는 학급 학년으로 정해진다. `choices`가 있는 문제만 출제된다.
- **팀 나누기**: 교사가 정하거나, 지난 4주 놀이터 점수를 기준으로 서버가 고르게 나눈다(뱀 순서 배정). 팀 이름과 색은 고정 4~6종(§9 에셋)에서 고른다.
- **주 1회 실력발휘**: 교사가 팀전을 열 때 "이번 주 맞춤법 목록" 또는 "우리 반이 많이 틀린 맞춤법 20개"를 출제 범위로 고를 수 있다. 후자는 반 학생들의 `spelling` 복습 기록에서 오답 수가 많은 순으로 고른다.
- **중간에 나간 경우**: 하트비트가 30초 끊기면 "연결 끊김"으로 표시하고, 남은 문제는 0점이다. 1:1에서 상대가 나가면 남은 사람의 승리로 기록한다. 같은 방에 다시 들어오면 다음 문제부터 이어서 참여한다.

### 대결 결과의 순위·보상
- 주간 점수에 승 3, 무 1, 패 0과 참여 판 수를 기록한다. 같은 상대와 하루 3판을 넘는 대결은 순위에 넣지 않는다(친한 친구끼리 승을 주고받는 것을 막기 위해).
- 보말은 **승패가 아니라 참여**에 준다(§7). 순위와 보상을 분리해야 지는 아이가 떠나지 않는다.

## 6. 실시간 구조 — 함께캔버스 방식 재사용

### 원칙
1. **쓰기는 서버만** 한다. 학생은 API로 답을 보내고, 서버가 Admin SDK로 방 상태를 바꾼다.
2. **읽기는 클라이언트 구독**이다. 서버가 참가자에게 60초 만료의 `readerGrants/{uid}`를 발급하고, 하트비트마다 갱신한다(캔버스의 `grant()`와 같음).
3. **정답은 구독 경로에 두지 않는다.** 문제가 끝날 때 서버가 정답을 공개 문서에 써 준다.
4. **오래 실행되는 서버 프로세스가 없다.** Vercel 함수만으로 진행되도록, 시간이 지나면 다음 요청이 진행을 대신한다(지연 진행, §6.3).

### 저장 경로
| 경로 | 읽기 | 내용 |
|---|---|---|
| `playRooms/{roomId}` | 참가자 | `classId`, `mode`, `status: lobby\|countdown\|question\|reveal\|finished\|closed`, `round`, `roundStartsAt`, `roundEndsAt`, `hostKey`, `players` 요약(이름·캐릭터·팀·점수·연결 상태 최대 4명), `teams` 점수, `updatedAt`, `expireAt` |
| `playRooms/{roomId}/rounds/{n}` | 참가자 | 문제·섞인 보기·제한 시간. 공개 단계에서 `correctIndex`, `reveal`, 이 문제의 순위 추가 |
| `playRooms/{roomId}/players/{key}` | 본인 + 진행 교사 | 개인 답안 결과·누적 점수·마지막 접속 시각. 팀전에서는 학생이 자기 문서만 구독 |
| `playRooms/{roomId}/secrets/{n}` | 아무도 못 읽음 | 정답 인덱스 |
| `playRooms/{roomId}/answers/{n_key}` | 아무도 못 읽음 | 답안 원본, 서버 수신 시각. 문서 ID 고정으로 한 문제 한 번만 제출 |
| `playRooms/{roomId}/readerGrants/{uid}` | 규칙 검사용 | 캔버스와 같은 필드 |
| `classes/{c}/playInvites/{inviteId}` | 서버 전용 | 초대 (학생은 API 폴링으로 확인) |
| `classes/{c}/playPresence/{studentKey}` | 서버 전용 | 허브 접속 표시. 마지막 접속 시각만 저장 |

`firestore.rules`에 `classCanvases`와 같은 형태의 `playRooms` 블록을 **추가**한다. `permitted()`는 방의 `classId`와 학생의 `classId`·`authVersion`·비활성 상태, grant 만료를 검사한다. `players/{key}`는 `key == grant.playerKey`이거나 grant의 `role == 'teacher'`일 때만 읽을 수 있다. `secrets`·`answers`는 `allow read, write: if false`다.

### 상태 전이 (`room-machine.ts`, 순수 함수)

```
lobby ──시작(방장/교사)──▶ countdown(3초) ──▶ question ──마감 또는 전원 답──▶ reveal(4초) ──▶ question … ──마지막 문제──▶ finished
  │                                                                                                         │
  └── 10분 동안 시작 안 함 ─▶ closed                                                    결과 저장 후 30분 뒤 expireAt
```

- 각 상태에는 **끝나는 시각**이 있다. 어떤 참가자든 그 시각이 지난 뒤 `POST /rooms/{id}/tick`을 보내면, 서버가 트랜잭션 안에서 상태를 한 단계 진행한다. 이미 진행됐으면 아무것도 하지 않는다. 클라이언트는 마감 시각에서 300ms 뒤에 `tick`을 보내고, 응답이 없으면 1초 간격으로 다시 보낸다.
- 팀전은 교사 화면이 `tick`과 `next`(다음 문제 수동 진행)를 보낸다. 교사는 일시정지·건너뛰기·종료를 할 수 있다.

### 시간 공정성
- **답 시각은 서버 수신 시각**으로 계산한다. 클라이언트가 보낸 시각은 쓰지 않는다.
- 화면 카운트다운은 서버 시계에 맞춘다. 클라이언트는 API 응답의 `serverTime`으로 시계 차이를 재고, `roundStartsAt`을 자기 시계로 바꿔서 표시한다.
- 순발력 방에서 **수신 시각 차이가 150ms 안이면 같은 순위**로 친다. 같은 교실 와이파이의 작은 지연 차이로 승부가 갈리지 않게 하기 위해서다.
- 마감 뒤 500ms까지 도착한 답은 받는다(네트워크 여유). 그 뒤는 거부한다.

### 쓰기 부하
- Firestore 문서 하나는 초당 1회 정도의 쓰기만 안정적이다. 팀전에서 30명이 2초 안에 답을 내면 방 문서에 쓰기가 몰린다. 그래서 **답안은 `answers`와 각자의 `players/{key}`에만 쓰고, 방 문서와 팀 점수는 `reveal`로 넘어갈 때 한 번에 집계한다.**
- 1:1과 순발력 방은 4명 이하라 방 문서의 `players` 요약을 답마다 갱신해도 된다(빠른 점수 반영이 재미 요소이기 때문).
- 비용 추산: 30명 팀전 10문제에서 학생 1명이 받는 갱신은 문제당 방 문서 2~3회 + 문제 문서 2회 + 자기 문서 1회다. 30명 × 10문제 × 약 6회 = 약 1,800 읽기/판으로, 함께캔버스 한 수업보다 적다.

### 정리
- `expireAt`에 Firestore TTL 정책을 건다. **TTL 정책은 콘솔·gcloud 설정이 필요한 운영 작업**이라 배포와 별도로 한 번 해 둔다. 걸려 있지 않아도 기존 `/api/cron/upload-cleanup` 예약에서 만료된 방을 지우는 보조 정리를 추가한다.
- 결과(점수·승패)는 `finished` 단계에서 각 학생의 `playgroundScores`에 트랜잭션으로 옮긴 뒤 방 문서는 지워도 된다.

### 남용 방지
- 학생 1명이 만들 수 있는 방은 동시에 1개, 1시간에 10개다.
- 답 제출은 문제당 1회(문서 ID 고정), 이모지 반응은 2초당 1회다.
- 교사 설정에서 `학생끼리 대결 허용`을 끄면 학생은 방을 만들 수 없고, 교사가 연 팀전에만 참여한다.
- 교사 설정의 **이용 시간대**(예: 08:40~09:00, 쉬는 시간, 방과후)를 정하면 그 밖에는 대결방을 만들 수 없다. 혼자 풀기는 언제나 열려 있다. 이 시간대는 수업 중 딴짓을 막고 싶은 담임을 위한 선택 기능이다.

## 7. 보말과 순위

- **보말 연결은 교사가 켜는 선택 기능**이고, 기본값은 꺼짐이다. 켜면:
  - 혼자 풀기: 점수가 붙는 문제 10개마다 1보말, 하루 최대 3보말.
  - 대결: 끝까지 참여한 판마다 1보말, 하루 최대 3보말. 승패와 상관없다.
  - 팀전: 교사가 판이 끝난 뒤 참여 학생 전체에게 주는 양을 정한다(0 이상 정수).
  - 장부 `source: 'playground'`, ID는 `playground_{date}_{종류}_{번호}`로 고정한다. 교사 보말 로그에서 구분된다.
- **주간 순위**는 월~일 우리 반 기준이다. 탭은 세 가지: `문제 왕`(혼자 풀기 점수), `대결 왕`(승점), `꾸준왕`(참여한 날 수). 동점은 공동 순위다. 학생에게는 상위 5명과 내 순위만 보여 준다. 교사는 전체를 본다.
- 교사 설정 `순위 보이기`를 끄면 학생 화면에서 순위를 숨기고 개인 기록만 보여 준다. [point.md](point.md)의 "학생끼리 비교하지 않는다" 원칙과 데일리 퀴즈 주간 순위가 공존하므로, 반마다 고를 수 있게 둔다.
- daily-quiz 순위(`dailyQuizScores`)와 합치지 않는다. 교과 점수와 놀이 점수가 섞이면 교사가 해석하기 어렵다.

## 8. API

모두 `/api/playground/...`. 변경 요청은 `assertOrigin`, 응답은 `Cache-Control: private,no-store`.

| 메서드·경로 | 사용자 | 내용 |
|---|---|---|
| `GET /home` | 학생 | 메뉴별 남은 문제 수, 복습할 맞춤법 수, 이번 주 내 점수·순위, 접속 중인 친구, 받은 초대 |
| `POST /solo/{kind}/next` · `/solo/{kind}/answer` · `/solo/{kind}/hint` | 학생 | §4 |
| `GET /ranking?week=` | 학생·교사 | 주간 순위 |
| `POST /rooms` | 학생·교사 | 방 만들기 `{mode, kinds, rounds?, teams?, requestId}` |
| `POST /rooms/join` | 학생 | 4자리 코드로 참가 |
| `POST /invites` · `/invites/{id}/accept` · `/invites/{id}/decline` | 학생 | 초대 |
| `POST /rooms/{id}/start` · `/tick` · `/next` · `/pause` · `/end` | 방장·교사 | 진행 (`tick`은 참가자 누구나) |
| `POST /rooms/{id}/answer` | 참가자 | `{round, choice}` |
| `POST /rooms/{id}/heartbeat` | 참가자 | 접속 표시 + `readerGrant` 갱신. 10초 간격, 화면이 숨겨지면 중단 |
| `POST /rooms/{id}/react` | 참가자 | 고정 이모지 |
| `POST /rooms/{id}/leave` | 참가자 | 나가기 (`pagehide`에서 `keepalive`) |
| `GET/PUT /teacher/settings?classId=` | 교사 | 켜기·끄기, 대결 허용, 이용 시간대, 순위 보이기, 보말 연결 |
| `GET/POST/PATCH /teacher/items` | 교사 | 우리 반 문제 관리 |
| `GET/PUT /teacher/spelling-list?week=` | 교사 | 이번 주 맞춤법 목록 (5~40개) |
| `GET /teacher/report?classId=&week=` | 교사 | 학생별 참여·정답률, 반에서 많이 틀린 맞춤법 |

교사 API는 모두 `canManageClass`로 본인 학급인지 확인한다.

## 9. 화면

### 학생
- **허브** `/student/playground`: 위쪽에 이번 주 내 점수와 순위, 그 아래 메뉴 카드 4개(넌센스·수수께끼·오늘의 국어·맞춤법), 그 아래 `혼자 풀기 / 1:1 대결 / 순발력 방 / 코드로 참가` 버튼, 오른쪽(모바일에서는 아래)에 접속 중인 친구와 초대함을 둔다.
- **혼자 풀기**: 문제 카드 → 입력칸 또는 보기 → `힌트 보기` → 결과 카드(정답·설명·다음 문제). 학생의 나의 작은 세상 버디가 결과에 반응한다(맞히면 기뻐하는 말풍선).
- **대기실**: 참가자 캐릭터가 최대 4칸, 방 코드는 크게, 방장에게만 `시작` 버튼.
- **게임 화면**: 위쪽에 원형 타이머, 가운데 문제, 아래 보기 버튼 4개(색과 도형 □△○◇을 같이 써서 색약 학생도 구분 가능). 답을 고른 뒤에는 "다른 친구 기다리는 중", 공개 단계에서는 정답 강조와 이 문제의 순위를 보여 준다.
- **결과**: 1~4위 시상대, 팀전은 팀 점수 막대.

### 교사
- **설정·관리** `/teacher/playground`: 탭 4개 — 설정, 우리 반 문제, 맞춤법 목록, 리포트. 그리고 `팀전 열기` 버튼.
- **진행 화면** `/teacher/playground/live/[roomId]`: 프로젝터용 큰 글씨. 대기 단계에서는 방 코드와 QR(기존 `qrcode` 패키지), 들어온 학생 수, 팀 배정을 보여 준다. 문제 단계에서는 문제·타이머·답한 학생 수, 공개 단계에서는 정답·보기별 선택 비율·팀 점수를 보여 준다. 진행 버튼은 다음·일시정지·종료다.

## 10. 단계와 완료 기준

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| **1. 혼자 풀기** | 허브, 넌센스·수수께끼·오늘의 국어, 문제은행 v1, 주간 순위, 교사 설정(켜기·순위·보말) | 정규화·초성·보기 섞기·점수·하루 상한 단위 테스트. 동시 제출 2건에서 점수·보말 중복 0건. 다른 반 학생 정보 노출 0건 |
| **2. 맞춤법** | 맞춤법 은행, 교사 주간 목록, 개인 복습, 리포트의 "많이 틀린 맞춤법" | 복습 간격이 daily-quiz 규칙과 같음. 띄어쓰기 정답 판정 테스트 |
| **3. 학생 대결** | 실시간 엔진, 1:1, 순발력 방, 초대·코드 참가, 결과 반영 | 상태 전이 테스트(마감·전원 답·중간 이탈·재접속·중복 `tick`). 규칙 에뮬레이터 테스트: 다른 반·만료 grant·비활성 학생은 구독 불가, `secrets` 읽기 불가. 4개 브라우저 동시 플레이 |
| **4. 교사 팀전** | 진행 화면, 팀 배정, 주 1회 맞춤법 실력발휘, 교사 지급 | 30개 탭 부하 시험에서 답 유실 0건, 팀 점수 = 팀원 평균. 교사 일시정지·건너뛰기 |
| **5. 선택** | AI 초안 + 교사 승인, 이용 시간대, 이모지 반응 | 승인 전 문제가 학생에게 출제 0건 |

각 단계는 `npm test`, `npm run typecheck`, `npm run build`를 통과한 뒤 기능 단위로 커밋·푸시하고, GitHub 연동 자동 배포 상태를 확인한다([AGENTS.md](AGENTS.md)).

## 11. 정해야 할 것

- 보말 연결의 기본 지급량(§7의 숫자는 제안값이다).
- 문제은행 v1을 누가 검수할지. 넌센스는 지역·세대에 따라 통하지 않는 말장난이 있어서 현장 교사의 검수가 필요하다.
- 학생 대결의 이용 시간대 기본값을 둘지(기본 없음을 제안).
