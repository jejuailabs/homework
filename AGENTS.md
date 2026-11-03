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

- 새 메뉴·기능을 만들면 같은 작업 안에서 베리용 읽기 도구(`classroom-tools.ts` 등)와 분류표 `DOMAINS` 칸(메뉴, 담긴 것, 핵심 숫자, 도구, 민감도, 읽기 비용, 대표 질문)을 추가한다.
- 기존 기능에 데이터 필드(태그·날짜·출처 등)가 늘면 해당 도구의 입력 조건과 응답, 도구 설명을 함께 고친다. 메뉴에서 찾을 수 있는 것은 베리도 같은 조건으로 찾을 수 있어야 한다.
- 쓰기는 미리보기 카드 후 선생님 확인으로만 저장하고, 가명·민감 기록 제외 등 `BERRY_IMPLEMENTATION_HANDOFF.md` §1 불변 조건을 지킨다.
- 분류표 '기타' 칸에 도구가 남지 않게 한다. 베리 노출이 맞지 않는 기능(학생 비밀 일기 본문 등)은 제외 사유를 도메인 설명이나 PR에 적는다.

사용자가 2026-11-03에 명시한 원칙이다.

