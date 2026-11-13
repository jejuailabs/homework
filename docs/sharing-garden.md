# 함께 모은 성장 꽃 → 나눔 꽃밭

2026-11-13, origin/main `08316ac`에서 확인한 구조와 이번에 더한 학급 나눔 적립을 정리한다.

## 1. 지금까지의 성장 꽃 (학생 개인 값)

| 무엇 | 어디 |
|---|---|
| 문구 "함께 모은 성장 꽃", 힌트 "선생님이 숙제를 확인하면 함께 자라요." | `src/messages/product-ko.json` `student.growth*` (영어는 `product-en.json`) |
| 학생 홈 표시: `xp = profile.xp`, `flowers = floor(xp/10)`, 꽃 도장 5개 | `src/components/student-workspace.tsx` `ws-growth-strip` |
| 적립 규칙: 숙제를 처음 `done`으로 확인하면 10점, 다시 확인해도 0 | `src/lib/server/policy.ts` `nextReview()` |
| 저장: `classes/{classId}/students/{studentId}.xp`에 `FieldValue.increment` | `src/lib/server/api.ts` `reviewSubmission()` (단건 `review`, 일괄 `reviewBatch` 모두 이 함수) |
| 학생 생성 시 `xp: 0` | `api.ts` 학생 등록 트랜잭션 |
| 읽기만 하는 곳 | `studentProfile`, 교사 명단(`teacher-workspace.tsx`), 전시(`exhibitions.ts`), 나의 작은 세상(`my-space/server.ts`) |

- **xp가 오르는 경로는 숙제 확인 하나뿐**이다(코드 전체 검색 결과). 깎이는 경로는 없다. 다시 하기(`revision`)로 바꿔도 이미 준 10점은 남는다.
- 이름은 "함께 모은"이지만 실제로는 **학생 개인 값**이다.
- 보말(`points`, `pointSettings`, `awardHomeworkPoints`, 상점)은 별개 화폐다. 같은 숙제 확인 트랜잭션에서 함께 지급될 뿐 값은 섞이지 않는다.

## 2. 이번에 더한 것: 학급 나눔 꽃밭

개인 xp 로직은 그대로 두고, 같은 숙제 확인 트랜잭션에서 **학급 월 합계**를 따로 쌓는다.

- 문서: `classes/{classId}/growthMonthly/{YYYY-MM}` (한국 시간 기준 월)
  - `points`: 이번 달 반이 모은 전체 점수(상한 없음, 기록용)
  - `credited`: 나눔에 반영되는 점수 = `min(points, 1500)` → 1점 = 1원
  - `full`, `filledAt`: 1,500점 도달 여부와 시각
  - `paid`: 유료 학급 여부(지금은 결제가 없어 항상 `false`, 자리만 둠)
- 상한 처리: `reviewSubmission()` 트랜잭션 안에서 읽고(`readClassGarden`) 계산해 씀(`writeClassGarden`). 읽기는 보말 지급(쓰기)보다 먼저 해야 해서 그 앞에 둔다.
- 규칙 함수(순수): `src/modules/sharing-garden/policy.ts` — `creditMonth`, `seoulMonth`, `gardenStage`, `publicClassLabel`, `sharingConfig`
- 서버: `src/modules/sharing-garden/server.ts` — 전국 집계는 collection group 합계·개수 쿼리, 인스턴스당 1분 캐시
- API: `GET /api/sharing-garden`(로그인 없이도 전국 현황, 로그인하면 우리 반), `PUT /api/sharing-garden/classes/{id}/visibility`(선생님이 반 이름 공개)
- 화면: `/sharing-garden` 전국 나눔 대시보드, 학생 홈 성장 꽃 아래 "우리 반이 이번 달 모은 나눔 꽃" 띠(`strip.tsx`)
- 사업계획서용 예시 화면: `/sharing-garden?demo=1` (화면 위에 "예시 화면" 표시, 서버 호출 없음)
- 베리: `나눔 꽃밭` 메뉴와 `get_sharing_garden` 읽기 도구

## 3. 설정값 (환경변수, 없으면 기본값)

| 변수 | 기본 | 뜻 |
|---|---|---|
| `SHARING_GARDEN_RECIPIENT` | 빈 값 | 이번 달 기부처 이름. 운영자가 정한다 |
| `SHARING_GARDEN_REQUIRE_PAID` | `false` | `true`면 `paid` 학급만 집계. 결제 기능이 생기면 켠다 |
| `SHARING_GARDEN_GOAL_WON` | `1500000` | 전국 이번 달 목표(1,000학급 × 1,500원) |

## 4. 개인정보·운영 원칙

- 학생 이름은 어디에도 나가지 않는다. 반 이름은 선생님이 켠 경우에만 순위에 보이고, 아니면 "4학년 어느 반"처럼 표시한다.
- 적립은 돈이 오가는 것이 아니라 월말 정산용 기록이다. 실제 기부 집행과 기부처 선정은 운영자가 따로 한다.
- 결제(`classes/{id}.billing.paid`)가 생기면 그 값을 `true`로 쓰고 `SHARING_GARDEN_REQUIRE_PAID=true`로 바꾼다. 월 문서의 `paid`는 적립할 때마다 그 시점 값으로 바뀌므로, 월 중간에 결제한 학급은 다음 숙제 확인부터 반영된다.
- Firestore 규칙은 클라이언트 접근을 막고(서버 전용), 색인은 `firestore.indexes.json`의 `growthMonthly` 항목이다. 운영 반영 시 색인 배포가 먼저 끝나야 전국 집계가 동작한다.
