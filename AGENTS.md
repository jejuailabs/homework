<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 커밋과 운영 배포 원칙

- 검증을 마친 작업은 기능·수정 단위로 커밋하고 GitHub 원격 저장소에 푸시한다.
- Vercel 운영 배포는 GitHub 연동 자동 배포만 사용한다. CLI·API·대시보드를 통한 직접 배포 또는 수동 재배포를 하지 않는다.
- 배포 실패 시 원인을 수정하고 다시 커밋·푸시하여 자동 배포로 반영한다. 직접 배포로 우회하지 않는다.
- 커밋·푸시 완료와 운영 배포 완료를 구분하고, 자동 배포 상태를 확인한 뒤 결과를 보고한다.
- 비밀키·환경변수 실값·인증서·로컬 시험 자료는 커밋에 포함하지 않는다.

사용자가 2026-10-17에 명시한 기본 작업 방식이다.

## 베리 등록 원칙

베리(교사용 에이전트)는 모두의 교실의 모든 기능과 데이터 구조를 파악해야 한다. 베리는 `src/modules/berry-connector/catalog.ts`의 핵심 분류표와 도구 목록만 보고 움직이므로, 기능 작업에 아래를 함께 포함한다.

분류표는 트리다. 베리는 매 질문마다 **뿌리**(메뉴 한 줄 + 공통 원칙)만 읽고, 필요한 **메뉴**를 열 때만 그 메뉴의 안내(`guide`)와 도구를 읽는다. 그래서 기능이 늘어도 뿌리는 늘지 않는다.

- **새 메뉴**를 만들 때만 `DOMAINS`에 한 칸(메뉴, 한 줄 설명 `what` 60자 이내, 안내 `guide`, 핵심 숫자, 도구, 민감도, 읽기 비용, 부르는 말 `words`)과 `MENU_LINKS` 바로가기, 베리용 읽기 도구를 추가한다.
- **기존 메뉴 안의 기능**이 늘면 그 메뉴의 도구 설명·입력 조건·응답을 고치고, 도구만으로 알 수 없는 주의점만 그 메뉴 `guide`에 한 줄 적는다. 뿌리(`what`, `CATALOG_RULES`)는 건드리지 않는다. 메뉴에서 찾을 수 있는 것은 베리도 같은 조건으로 찾을 수 있어야 한다.
- **버그 수정, 화면만 바뀌는 일, 베리가 할 수 없는 화면 기능**은 분류표에 적지 않는다. "화면에서 한다" 목록을 늘리지 않는다(공통 원칙 한 줄이 이미 있다).
- `CATALOG_RULES`에는 모든 메뉴에 걸친 원칙만 둔다(8줄까지). 한 메뉴의 원칙은 그 메뉴 `guide`로 간다.
- 글자 한도는 테스트가 지킨다: 뿌리 2,500자, 메뉴 안내 1,500자. 메뉴 안내가 넘치면 문장을 줄이거나 메뉴를 둘로 나눈다(하위 메뉴). 한도를 올리지 않는다.
- 쓰기는 미리보기 카드 후 선생님 확인으로만 저장하고, 가명·민감 기록 제외 등 `BERRY_IMPLEMENTATION_HANDOFF.md` §1 불변 조건을 지킨다.
- 분류표 '기타' 칸에 도구가 남지 않게 한다. 베리 노출이 맞지 않는 기능(학생 비밀 일기 본문 등)은 제외 사유를 메뉴 안내나 PR에 적는다.
- 위 반영은 사용자에게 따로 묻지 않고 기능 작업의 기본 범위로 한다. PR 설명에 베리에 무엇을 기록했는지(또는 기록할 것이 없었는지) 한 줄 적는다.

사용자가 2026-11-03에 명시하고 2026-11-04에 "별도로 묻지 말고 반드시 기록"으로 강화했으며, 2026-11-11에 "기능이 늘어도 구조적으로 양이 늘지 않게 트리로"로 고친 원칙이다.

## 외부 AI 모델 종료 일정

OpenAI가 종료를 예고한 모델을 쓰는 기능이다. 작업을 시작할 때 오늘 날짜가 종료일 30일 전 이후이면, 다른 일보다 먼저 사용자에게 알리고 교체 계획을 묻는다. 종료일이 지났으면 해당 기능이 멈췄을 수 있다고 바로 보고한다. 날짜는 [OpenAI Deprecations](https://developers.openai.com/api/docs/deprecations)에서 다시 확인한다.

| 모델 | 종료일 | 쓰는 곳 | 공식 후속 | 메모 |
|---|---|---|---|---|
| `gpt-4o-mini-tts`, `tts-1`, `tts-1-hd` | 2027-01-06 | 말하기·읽기 스튜디오 읽어 주기(`SPEECH_TTS_MODEL`, 기본 `gpt-4o-mini-tts`) | `gpt-realtime-2.1-mini` | 후속 모델은 Realtime API 전용이라 `audio/speech`를 지원하지 않는다. 실시간 방식으로 다시 만들거나 다른 음성 서비스로 바꿔야 한다. 기기에 저장된 목소리는 계속 재생된다 |
| `whisper-1` | 2027-02-26 | 작품 음성 자막(`VOICE_TRANSCRIBE_MODEL`, 기본 `whisper-1`) | `gpt-transcribe`, `gpt-live-transcribe` | `gpt-transcribe`는 문장 타임스탬프가 없어 자막이 글자 수 비례 배분으로 바뀐다. 말하기 스튜디오 전사는 이미 `gpt-transcribe`로 옮겼다 |

사용자가 2026-11-04에 명시한 원칙이다. 로컬 예약 알림(2026-12-07, 2027-01-27)도 함께 걸어 두었다.

