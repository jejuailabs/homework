# 로그인 없는 체험 (1단계)

2026-11-20 구현. 가상 학급 "햇살초등학교 3학년 2반"으로 모두의 교실을 로그인 없이 둘러보는 화면이다. 주소는 `/try`이고, 첫 화면에는 아직 연결하지 않았다.

## 1단계 범위

| 코너 | 주소 | 내용 |
|---|---|---|
| 전시관 | `/try?go=gallery` | 전시실 3개(아늑한·바다 산호·우주 지구), 작품 25점, 3D로 걸어 보기, 작품 이야기, 방명록 |
| 보말과 캐릭터 | `/try?go=bomal` | 선생님이 칭찬 보말 주기 → 학생이 상점에서 펫·옷·방 배경·가구를 사서 방과 캐릭터에 적용 |
| 작품집 | `/try?go=artbook` | 샘플 25점으로 만든 실제 작품집 PDF 미리보기 8쪽과 전체 파일 |
| 시작하기 | `/try?go=start` | 우리 반 만드는 순서 안내 |

다음 단계: 숙제 → 전시·보드 흐름, 참여보드, 카드놀이, 베리에게 묻기, 첫 화면 버튼.

## 기존 시스템과의 분리

- 새 파일만 추가했다. 기존 파일은 고치지 않았다.
  - `src/modules/try-demo/` (틀, 코너, 샘플 자료, 스타일, 검사)
  - `src/app/try/page.tsx`
  - `src/data/try-demo-storage.json`, `scripts/try-demo/`
- 체험 코드는 우리 서버를 부르지 않고, 로그인·DB·Firebase 코드를 가져오지 않는다.
- 3D 전시실, 캐릭터, 방, 상점 목록은 실제 부품과 목록을 고치지 않고 가져다 쓴다. 값만 샘플로 넣는다.
- 방문자가 한 일(방명록, 보말, 구매, 가구 배치)은 화면 안에만 있고 창을 닫으면 사라진다.
- 브라우저에 남는 것은 열어 본 코너 목록 하나다(`try:seen`).
- 스타일은 모두 `.try-`로 시작한다.
- `node src/modules/try-demo/run-tests.mjs`가 위 조건을 검사한다. 네트워크 호출, API 주소, 서버·Firebase 가져오기, 다른 저장 이름이 들어가면 실패한다.

## 끄는 방법

- 환경 값 `TRY_DEMO_DISABLED=true` → `/try`가 404가 된다.
- `src/data/try-demo-storage.json`의 `ready`가 `false`여도 404다.
- 검색에는 나오지 않게 했다(noindex).

## 샘플 자료

- 학생 이름, 작품, 글은 모두 지어낸 것이다. 실제 학생 자료는 없다.
- 작품 25점은 `scripts/try-demo/make-art.mjs`가 크레파스 그림 느낌으로 그린다.
- 작품집 PDF는 `scripts/try-demo/make-artbook.mjs`가 실제 작품집 조판기(`src/modules/class-artbook/pdf.ts`)로 만든다. 미리보기 쪽 그림은 그 PDF의 1~8쪽을 110dpi로 바꾼 WebP다(`artbook/page-01.webp` …).
- 그림과 PDF는 Firebase Storage `try-demo/v1/`에 올린다(`scripts/try-demo/upload-assets.mjs`). 저장소에는 넣지 않는다.
- 로컬에서 볼 때는 `NEXT_PUBLIC_TRY_DEMO_ASSET_BASE`로 다른 주소를 지정할 수 있다.

## 검증

- 격리·자료 검사 통과, `tsc --noEmit`, 기존 `npm test` 통과
- 로컬 화면 확인(1280px, 375px)
  - 전시관: 목록, 작품 창, 아늑한 전시관 3D에 작품이 걸림
  - 보말: 보말 주기, 방 배경·옷 구매와 적용, 보말 부족 안내
  - 작품집 미리보기, 시작하기
- 올린 그림과 PDF가 운영 주소(ourclass.co.kr)에서 열리는 것 확인

확인하지 못한 것
- 바다·우주 전시관의 3D. 전시관 자료가 운영 주소에서만 열려 로컬에서는 어둡게 보였다. 운영에서 확인해야 한다.
- 실물 휴대폰과 전자칠판.
- 선생님 사전 시연.
