# region-quest — 우리 동네 지도 탐험 RPG 모듈

학교 중심 지역 팩 → 백지도·약도 → 2D 픽셀 RPG → 수업 결과물을 만드는 독립 모듈입니다.

지역의 6개 분야를 대화·조사·체험 미션으로 배우고, 향후 다른 지역까지 탐험을 이어 갑니다. 첫 버전부터 거점 귀환과 미션 이어하기를 갖추며, 지역별 미니맵·월드맵·발견한 지점 워프를 확장할 수 있게 설계합니다. 인물 표정, 조사 장면, 이야기 연출 등 이미지 에셋도 미션과 함께 제작합니다.

- 구현 지시서(Codex 의뢰용): [IMPLEMENTATION_BRIEF.md](IMPLEMENTATION_BRIEF.md)
- 현장 조사와 게임 설계: [docs/strategy.md](docs/strategy.md)
- 애월초 OSM 실측: [docs/aewol-osm-measurement.md](docs/aewol-osm-measurement.md)

상태: 기획 문서만 있음(구현 전).

## 분리 계약

이 모듈 때문에 다른 시스템이 꼬이지 않도록 아래 규칙을 지킵니다.

1. **코드는 이 폴더 안에만 둡니다.** 모듈 밖에는 IMPLEMENTATION_BRIEF.md §3 "모듈 밖 접점" 표의 얇은 연결 파일만 둡니다.
2. **기존 코드는 가져다 쓰기만 합니다.** `src/lib/*`, `src/components/*`의 함수와 컴포넌트를 import해서 쓸 수 있지만 수정하지 않습니다. 동작을 바꿔야 하면 모듈 안에 복사해서 확장합니다(예: `neighborhood.ts`의 OSM 파싱 → `geo/`, `collect/`).
3. **DB는 공유하고 데이터는 분리합니다.** 같은 Firebase 프로젝트를 쓰되 새 데이터는 아래 경로에만 씁니다.
   - `users/{uid}/regionPacks/*`, `regionPacksPublished/*`, `regionMapCache/*`, `regionQuestLimits/*`
   - `classes/{classId}/regionSessions/*`, `classes/{classId}/students/{studentId}/regionProgress/*`
   - `classes/{classId}/students/{studentId}/regionProfile/main` (지역 간 누적 성장·여권·귀환 정보)
   - Storage `region-quest/**`
   - 기존 문서(학급, 학생, 숙제, 포인트 등)는 **읽기만** 합니다. 기존 경로에 쓰는 일은 기존 API를 호출하는 방식으로만 합니다.
   - 보안 규칙은 기존 블록을 고치지 않고 새 블록을 추가만 합니다.
4. **기능 플래그로 격리합니다.** `REGION_QUEST_ENABLED`(교사 미리보기), `REGION_QUEST_STUDENT_ENABLED`(학생 배정)가 꺼져 있으면 모듈 밖에 아무것도 보이지 않고, API는 404를 반환합니다.
5. **빌드도 격리합니다.** 게임 런타임은 iframe 안에서만 실행합니다. 모듈 UI는 동적 import로 불러서 기존 페이지 번들 크기에 영향을 주지 않게 합니다.
6. **테스트도 모듈 안에 둡니다.** 테스트는 `tests/run-tests.mjs`에 두고, 공용 `npm test`에는 import 1줄로만 연결합니다.
7. **로컬 시험 자료는 커밋하지 않습니다.** OSM 원본, 측정 JSON, 생성 원본 이미지는 `.cache/`(git 제외)에 둡니다.

## 제거 방법

플래그를 끄면 사용자에게 보이지 않습니다. 완전히 제거하려면 다음을 지우면 됩니다.
- 이 폴더
- 접점 파일들(api 재수출, 도구 항목 1줄, 규칙 블록, next.config 1줄, 테스트 import 1줄)
- `public/region-quest/`

Firestore의 `region*` 컬렉션은 다른 기능과 섞여 있지 않으므로 따로 정리할 수 있습니다.
