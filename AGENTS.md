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
