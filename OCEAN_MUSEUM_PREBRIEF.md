# 수중 미술관 키트 프리브리핑 (2026-11-12)

## 무엇인가
- 위치: `output/exhibition-museum-concepts-2026-11-12/ocean-museum-kit/` (602개 파일, 297MB, 커밋 안 함)
- 원본: `C:\Users\na\Documents\Codex\2026-11-12\dhks\outputs\ocean-museum-kit` (복사만 함, 원본 그대로)
- 성격: 이미지 에셋 키트 + **걷기 실행본 `walk.html` (2026-11-13 제작, 31MB, 로컬 전용)**. 원본 코드 `walk-src/`, 빌드 `python walk-src/build_walk.py`
- 전시관 4종: 산호 아치관(coral) · 켈프 회랑관(kelp) · 심해 블루아이관(abyss) · 화이트 라군관(lagoon)

| 폴더 | 내용 | 크기 |
| --- | --- | --- |
| architecture | 테마별 외관·수조·전시벽·문틀·창·벤치·액자·조명 15파츠 ×4 | 40M |
| biodiversity | 생물 48종 (투명 시트 8장 + 개별 WebP) | 34M |
| life | 거북·고래·가오리 등 15종, 4프레임 유영 애니메이션 + fps·기준점 | 24M |
| materials | 테마별 8표면 × 색·노멀·거칠기 맵 | 23M |
| environment / water | 2:1 바다 파노라마 4장, 굴절광·빛줄기·물결·부유입자 | 2M |
| scenes / references / scene-masters | 합성용 배경 12장, 원안 12장, 생성 원본 | 98M |
| furnishings | 의자·화병·받침대 | 8.5M |
| layouts/exhibition.json | 20개 전시실 × 작품 25점의 벽·창·출입구 좌표 (미터 단위, 3D 기준) | — |
| shared | 관람 고양이 스프라이트, 예시 작품 145점, 20개 전시 순서 | 5.8M |
| catalog-download, index.html | 카탈로그 뷰어 (index.html 단독 9.7MB) | 64M |

## 지금 앱과의 관계
- 현재 학급 전시관(`src/components/exhibition-scene.tsx`)은 Three.js 정적 미니어처, 방당 작품 8점, 테마 4종(cozy·forest·sky·ocean)이고 ocean은 **색 팔레트만** 다름.
- 키트는 방당 25점·20개 방·걷기 이동을 전제로 설계됨 → 지금 화면보다 훨씬 큰 구조.

## 진행 방안 (택1)
1. **가볍게: 기존 ocean 테마 꾸미기** — 파노라마·빛줄기·물결·생물 몇 종만 골라 지금 미니어처 창 밖/벽에 붙임. 에셋 약 3~5MB. 영향: 학급 전시관에서 ocean 고른 반만.
2. **중간: 수중 미술관 테마 4종 추가** — 산호·켈프·심해·라군을 새 테마로, 파츠·재질·유영 생물까지 사용. 방 구조(8점)는 유지.
3. **크게: 걷는 수중 미술관** — `space-museum-kit`처럼 걷기·20개 방·25점 실행본을 만들어 앱에 붙임. 우주 미술관과 같은 엔진으로 합치는 게 맞음.

추천: **1 → 2 순서**. 3은 우주 미술관 방향 결정과 같이 정함.

## 공통 원칙
- 이미지는 Vercel 번들 대신 Firebase Storage에 올리고 경로만 씀 (카드 이미지와 동일 원칙).
- 원본 PNG·masters·references·catalog는 올리지 않음. WebP만 골라 씀.
- 예시 작품 145점은 시연용. 실제 반에서는 학생 작품으로 교체.

## 정할 것
- [ ] 1·2·3 중 방향
- [ ] 4개 관 중 먼저 쓸 관 (전부 / 1개)
- [ ] 키트 원본 폴더(Documents\Codex) 삭제 여부
