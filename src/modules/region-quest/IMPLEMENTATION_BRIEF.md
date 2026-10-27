# 우리 동네 지도 탐험 RPG — 구현 전략서 (Codex 의뢰용)

작성일: 2026-10-27 · 의뢰 대상: Codex · 근거 문서: [docs/strategy.md](docs/strategy.md)(현장 조사·게임 설계), [docs/aewol-osm-measurement.md](docs/aewol-osm-measurement.md)(애월초 실측)

이 문서는 **구현 지시서**입니다. 기능의 이유와 교육적 근거는 전략 문서에 있습니다. 여기에는 *무엇을, 어떤 순서로, 어떤 데이터 계약과 완료 기준으로* 만들지를 적었습니다. 이미지 생성이 필요한 단계는 생성 규격, 프롬프트, 후처리, 검수 절차까지 포함했습니다. 아래 내용은 아직 구현된 것이 아닙니다.

---

## 0. 한눈에 보기

**만들 것**: 학교를 중심으로 실제 길과 장소를 모은 *지역 팩*을 만듭니다. 이 한 벌의 데이터로 다음 세 가지를 생성합니다.
1. 교사용 백지도·약도(SVG/PDF, 여러 스타일)
2. 아이들이 걸어 다니는 귀여운 2D 픽셀 RPG(안개 = 백지도, 걸으면 지도가 되살아남)
3. 수업 결과물(내가 완성한 지도, 장소 일기, 성취기준별 평가 근거)

**첫 시범 학교**: 제주 애월초등학교(OSM way 371530161, 33.46512, 126.32235). 실측 결과는 다음과 같습니다.
- 도로·해안선·공공기관: 충분함
- 건물·토지 이용: 크게 부족함
- 문화유산: OSM에 없음

**단계 요약**

| 단계 | 이름 | 핵심 산출물 | 이미지 생성 |
|---|---|---|---|
| R0 | 기반 정리 | 모듈 골격, 측정 스크립트 이식, 데이터 소스 확인 | – |
| R1 | 지역 팩 v2 | 타입·검증·저장·v1 호환 | – |
| R2 | 수집기 | 학교 검색, OSM, 국가유산, 교사 추가 | – |
| R3 | 검수 큐 | 사실 카드 승인 UI, 출처 화이트리스트 | – |
| R4 | 약도 엔진 | 백지도 L1~L3 외 5개 스타일, PDF | 그림지도 텍스처 소수 |
| R5 | 타일 컴파일러 | 좌표 → 타일맵, 도달 검사, 절차적 채우기 | – |
| R6 | 아트 파이프라인 | 스타일 바이블, 아틀라스 생성·후처리·검수 | **대량** |
| R7 | 게임 런타임 | 이동, 충돌, 안개, 대화, 미니맵, 저장 | 사용 |
| R8 | 퀘스트 엔진 | 템플릿 퀘스트, 이야기 체인, 능력 성장 | 카드 일러스트 |
| R9 | 교실 연동 | 학생 배정, 교사 통제, 학급 공동 지도, 리포트 | – |
| R10 | 출력·평가 | 내 지도 PDF, 포트폴리오, 성취기준 리포트 | – |
| R11 | QA·출시 | 기기, 접근성, 보안 규칙, 성능 | – |

각 단계는 **기능 단위로 검증 → 커밋 → 푸시**합니다(§1).

---

## 1. 작업 원칙 (반드시 지킬 것)

0. **모듈 분리 원칙이 최우선입니다.** 이 기능은 다른 시스템을 꼬이게 하지 않도록 `src/modules/region-quest/` 안에서 독립적으로 개발합니다. Firebase 프로젝트(Firestore, Storage, Auth)는 공유하지만 *자기 컬렉션만* 씁니다. 경계 규칙은 [README.md](README.md)의 "분리 계약"을 따르고, 위반이 필요하면 작업을 멈추고 사용자에게 먼저 묻습니다.
1. **AGENTS.md를 따릅니다.**
   - 이 저장소의 Next.js는 학습 데이터와 다른 버전입니다. 라우트, 캐시, 설정 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 읽습니다.
   - 검증을 마친 작업은 기능·수정 단위로 커밋하고 GitHub에 푸시합니다.
   - 배포는 **GitHub 연동 자동 배포만** 사용합니다. CLI나 대시보드로 직접 배포하지 않습니다.
   - 커밋·푸시 완료와 운영 배포 완료를 구분해서 보고합니다.
   - 비밀키, 환경변수 실값, 로컬 시험 자료(원본 OSM 덤프, 측정 결과 JSON, 생성 원본 이미지 묶음)는 커밋하지 않습니다.
2. **기존 `우리 동네 탐험` 도구를 깨지 않습니다.** v1 팩은 계속 열려야 합니다. 새 기능은 v2 경로로 확장합니다.
3. **학생에게 노출되는 사실은 교사 승인(`verified`)을 거친 것만** 내보냅니다. 서버에서 강제하고, 클라이언트 필터만으로 막지 않습니다.
4. **학생 개인정보를 최소화합니다.** GPS, 학생 사진, 학생 간 자유 채팅은 사용하지 않습니다. 개인 주택과 상호 라벨도 표시하지 않습니다.
5. UI 문구는 한국어가 기본이고 영어 병기 구조(`l(ko,en)`)를 유지합니다. 학생용 문구는 3학년 어휘로, 한 번에 2~3줄을 넘기지 않습니다.
6. 코드 스타일은 주변 코드를 따릅니다. 기존 lib는 짧은 함수, 압축된 한 줄 스타일, 테스트 파일 병치(`*.test.ts`), `src/lib/server/run-tests.mjs` 등록 방식을 씁니다.
7. 외부 데이터에는 항상 출처, 라이선스, 기준일(`retrievedAt`)을 남기고 모든 출력물에 표시합니다.

---

## 2. 현재 코드 기준점

| 영역 | 파일 | 재사용 방법 |
|---|---|---|
| 지역 데이터 타입·OSM 파싱·SVG | `src/lib/neighborhood.ts` | `MapCenter`, `NeighborhoodPlace`, `overpassQuery`, `parseOverpassMap`, `neighborhoodSvg`, `simplifyMapLine`을 v2 모듈로 일반화 |
| 지도 수집 API·캐시·한도 | `src/lib/server/neighborhood.ts`, `src/app/api/neighborhood/{map,packs}` | 캐시(`neighborhoodMapCache`), 교사별 일일 한도(`neighborhoodLimits`), 팩 저장(`users/{uid}/neighborhoodPacks`) 패턴 유지 |
| 교사 도구 UI | `src/components/neighborhood-tool.tsx`, `src/styles/neighborhood.css`, `src/lib/tool-catalog.ts`(`kind:'neighborhood'`) | 도구 창 안에서 단계형 UI로 확장 |
| 인쇄 | `src/lib/neighborhood-print.ts`, `pdf-lib`, `@pdf-lib/fontkit` | 백지도·내 지도 PDF |
| 출처 인용 AI | `CitedText`, `src/lib/ai-citations.ts`, `src/lib/ai-usage.ts` | 사실 요약·NPC 대사 초안, 사용량 집계 |
| iframe 게임 + 이어하기 | `src/components/learning-king-beta.tsx`, `src/app/api/learning-king-beta/route.ts`, `src/modules/learning-king/{demo,server,journey-storage.ts}` | 같은 격리 구조(`postMessage` 로드/저장, 교사 인증 후 HTML 제공) |
| 학급·학생 | `classes/{classId}/students/...`, `src/lib/roster.ts`, `class-students-link.ts` | 학생 배정, 진도 저장 |
| 갤러리·투표·리포트·포인트 | `exhibition-*`, `class-poll.tsx`, `class-report.tsx`, `points-*` | 장소 일기 게시, 동네 고치기 투표, 성취기준 리포트, 보상(선택) |
| 캐릭터 | `src/lib/characters.ts`, `public/characters/*.webp`, `design-assets/characters/*` | 기존 12캐릭터를 픽셀 아바타로 재해석 |
| 이미지 생성 기록 관례 | `docs/character-attachment-prompts.json`, `design-assets/characters/generation-prompts-v2.json` | 같은 형식으로 프롬프트·원본·후처리 기록 |
| 테스트 | `npm test` → `src/lib/server/run-tests.mjs`, `npm run typecheck`, `npm run build` | 새 순수 함수는 모두 여기에 등록 |

---

## 3. 목표 구조

**모든 코드, 문서, 스크립트, 에셋 원본 기록은 모듈 폴더 안에 둡니다.** 모듈 밖에는 Next가 요구하는 *얇은 연결 파일*만 둡니다(아래 "모듈 밖 접점").

```
src/modules/region-quest/
  README.md               # 분리 계약, 폴더 안내
  IMPLEMENTATION_BRIEF.md # 이 문서
  docs/                   # 전략 문서, 실측 리포트, 데이터 소스 확인 결과, 검수 시트
  pack/                   # RegionPack v2 타입·검증·v1 변환 (순수 함수, 테스트 대상)
  geo/                    # 투영, 도로 그래프, 단순화, 경계
  collect/                # (server) 학교·OSM·국가유산·관광 수집기, 정규화
  review/                 # 사실 상태 전이, 출처 화이트리스트
  maps/                   # 약도 스타일 엔진 (SVG), PDF 출력
  tiles/                  # 타일 컴파일러, 오토타일, 절차적 채우기, 도달 검사
  content/                # 퀘스트 템플릿, 이야기 체인 스키마, 능력 정의, 성취기준
  runtime/                # iframe 게임 (Canvas2D) — 서버가 인증 후 제공
  server/                 # 라우트 핸들러 본체, 권한, 캐시, Firestore 접근
  ui/                     # 교사·학생 React 컴포넌트와 CSS (작성·검수·출력·수업 통제·진입)
  assets/                 # 생성 프롬프트 기록, 스타일 바이블, 팔레트 (대용량 원본 제외)
  scripts/                # 측정, 아틀라스 후처리, 검사 스크립트
  fixtures/aewol/         # 애월초 시범 데이터 (근사 좌표·검수 전 표시, 원본 덤프는 제외)
  tests/run-tests.mjs     # 모듈 전용 테스트 진입점
```

**모듈 밖 접점 (이것 말고는 모듈 밖 파일을 수정하지 않음)**

| 파일 | 변경 내용 | 이유 |
|---|---|---|
| `src/app/api/region-quest/**/route.ts` | `export {GET, POST} from '@/modules/region-quest/server/...'` 같은 재수출만 | Next 라우팅은 app 폴더에 있어야 함 |
| `src/app/(필요 시) region-quest/**/page.tsx` | 모듈 `ui/` 컴포넌트를 렌더링만 | 학생 전용 화면이 필요할 경우 |
| `public/region-quest/` | 최종 아틀라스와 manifest만 | 정적 파일 제공 위치 |
| `src/lib/tool-catalog.ts` | 도구 항목 1줄 추가, **기능 플래그가 꺼져 있으면 숨김** | 교사 도구 목록 진입점 |
| 도구 창 렌더링 분기(현재 `kind:'neighborhood'`를 처리하는 곳) | 새 `kind` 1개를 모듈 컴포넌트로 동적 import | 진입점 |
| `firestore.rules`, `storage.rules` | `regionQuest*` 경로 규칙 블록 **추가만**(기존 규칙 수정 금지) | 공유 DB 권한 |
| `next.config.ts` | 게임 런타임 파일 포함 설정 1줄(러닝킹과 같은 방식) | 서버 번들 포함 |
| `src/lib/server/run-tests.mjs` | 모듈 테스트 진입점 1줄 import | `npm test`에 포함 |
| `.gitignore` | `src/modules/region-quest/.cache/` 추가 | 로컬 시험 자료 제외 |

※ `class-report`, 갤러리, `class-poll`, 포인트 연동(R9·R10)은 기존 파일을 고치지 않고 **기존 API를 호출하는 방식**으로 붙입니다. 기존 파일을 꼭 고쳐야 하면 그 작업을 별도 커밋으로 분리하고 미리 사용자에게 알립니다.

---

## 4. 데이터 계약

### 4.1 RegionPack v2

```ts
export type FactStatus = 'auto' | 'draft' | 'verified' | 'rejected';
export type SourceRef = {title: string; url: string; license: string; retrievedAt: string};
export type Fact = {id: string; text: string; source: SourceRef; status: FactStatus; verifiedBy?: string; verifiedAt?: string; audience: 'student' | 'teacher'};
export type PlaceKind = 'school' | 'office' | 'police' | 'fire' | 'post' | 'library' | 'clinic' | 'heritage' | 'tour' | 'harbour' | 'market' | 'nature' | 'peak' | 'viewpoint' | 'trail' | 'custom';
export type Place = {
  id: string; kind: PlaceKind; name: string; lat: number; lon: number;
  origin: 'osm' | 'heritage-api' | 'tour-api' | 'school-api' | 'teacher';
  osmRef?: string; facts: Fact[]; curriculum: string[]; level: 1 | 2 | 3;
  selected: boolean; hidden?: boolean;                 // hidden: 숨은 장소(안개 속 '?')
  game?: {role: 'npc' | 'landmark' | 'collectible' | 'quest-hub' | 'issue'; spriteKey?: string; npcKey?: string};
};
export type RoadNode = {id: string; lat: number; lon: number};
export type RoadEdge = {id: string; a: string; b: string; kind: 'major' | 'minor' | 'path' | 'cycle' | 'steps'; name?: string; points: [number, number][]};
export type Area = {id: string; kind: 'building' | 'water' | 'sea' | 'green' | 'farmland' | 'orchard' | 'beach' | 'sports' | 'industrial'; points: [number, number][]; name?: string; buildingUse?: string};
export type RegionPack = {
  version: 2; id: string; title: string; ownerUid: string; classIds: string[];
  school: {code?: string; name: string; lat: number; lon: number; osmRef?: string};
  extent: {radiusM: number; polygon?: [number, number][]; zones?: {id: string; name: string; polygon: [number, number][]}[]};
  projection: {originLat: number; originLon: number; metersPerTile: number};   // 기본 5
  network: {nodes: RoadNode[]; edges: RoadEdge[]};
  areas: Area[]; coastline: [number, number][][];
  places: Place[];
  sources: SourceRef[]; referenceDate: string; updatedAt: string;
  theme: {region: 'jeju' | 'urban' | 'rural' | 'coastal' | 'mountain'; storyTemplate: 'wind-spirit' | 'map-goblin' | 'river-mist'};
};
```

- `validateRegionPack`은 기존 `validateNeighborhoodPack`처럼 길이와 범위를 제한합니다(좌표 범위, 문자열 길이, 배열 상한). 상한 예시: places ≤ 300, edges ≤ 20,000, areas ≤ 10,000.
- `fromNeighborhoodPackV1(pack)`로 v1을 변환합니다. 변환 결과의 사실은 모두 `draft` 상태로 시작합니다.
- 학생용 직렬화 함수 `toStudentPack(pack)`은 `status==='verified' && audience==='student'`인 사실만 남기고, 교사 메모와 출처 원문 외 필드를 제거합니다. **서버에서만** 호출합니다.

### 4.2 TileMap (컴파일 결과)

```ts
export type TileLayerName = 'ground' | 'road' | 'water' | 'deco' | 'building' | 'collision' | 'fog' | 'zone';
export type TileMap = {
  version: 1; packId: string; packUpdatedAt: string; metersPerTile: number; width: number; height: number;
  chunkSize: 32; chunks: Record<string, {layers: Partial<Record<TileLayerName, string>>}>; // "cx,cy" → RLE base64
  spawn: {x: number; y: number}; places: {placeId: string; x: number; y: number; door: {x: number; y: number}}[];
  reach: {placeId: string; steps: number}[]; atlasVersion: string; checksum: string;
};
```

### 4.3 진도(학생) / 수업 세션(교사)

```ts
export type QuestProgress = {packId: string; revealed: string /* fog bitset RLE */; places: Record<string, {visitedAt?: string; doneAt?: string}>; abilities: ('compass' | 'symbols' | 'scale' | 'height' | 'oldmap')[]; quests: Record<string, {step: number; doneAt?: string}>; diary: {placeId: string; mood: string; text: string; snapshotKey?: string; at: string}[]; ideas: {issueId: string; choice: string; text: string; at: string}[]; minutesPlayed: number; updatedAt: string};
export type ClassSession = {packId: string; status: 'idle' | 'live' | 'paused' | 'recall' | 'ended'; openZones: string[]; todayQuests: string[]; sunsetAt?: string; updatedAt: string};
```

### 4.4 Firestore 경로 (제안)

| 경로 | 쓰기 | 읽기 |
|---|---|---|
| `users/{uid}/regionPacks/{packId}` | 소유 교사(서버 API 경유) | 소유 교사 |
| `regionPacksPublished/{packId}` | 서버만(`toStudentPack` 결과 + TileMap 참조) | 배정 학급 학생·교사 |
| `classes/{classId}/regionSessions/{packId}` | 담임 교사 | 학급 학생(읽기 전용) |
| `classes/{classId}/students/{studentId}/regionProgress/{packId}` | 서버 API(학생 본인 인증) | 본인, 담임 |
| `regionMapCache/{hash}` | 서버만 | 서버만 |

- TileMap과 큰 지오메트리는 Storage `region-quest/{packId}/{packUpdatedAt}/tilemap.json`에 둡니다. 읽기 권한은 배정 학급으로 제한합니다.
- `firestore.rules`와 `storage.rules`를 갱신하고, 규칙 테스트(또는 정책 함수 단위 테스트)를 추가합니다.

---

## 5. 단계별 작업

각 단계에는 **할 일 → 완료 기준 → 커밋 단위**가 있습니다. 완료 기준을 만족하지 않으면 다음 단계로 넘어가지 않습니다.

### R0. 기반 정리

**할 일**
- §3의 모듈 골격을 만듭니다.
- 측정 스크립트를 `src/modules/region-quest/scripts/measure.mjs`로 이식합니다. 반경 500m/1km/2km별로 도로 길이와 이름 비율, 보행 그래프 덩어리 수, 건물 수, POI 수, 문화유산 유무, 편집 연도를 냅니다.
  - 입력 원본(.osm/.json)은 `.gitignore` 경로(예: `src/modules/region-quest/.cache/`)에만 저장합니다.
- 데이터 소스를 확인하고 결과를 `src/modules/region-quest/docs/sources.md`에 표로 기록합니다.
  - 공공데이터포털 **전국초중등학교위치표준데이터**: API 키, 필드, 호출 한도
  - **국가유산청 문화재마스터위치정보 API**(data.go.kr 15153059): 좌표계, 필드
  - **한국관광공사 TourAPI 위치기반 조회**: 이용 조건, 이미지 사용 가능 여부
  - **국토지리정보원 배경지도/교육용 백지도 API**: 공공누리 1유형, 국외 반출 제한 때문에 Vercel 리전에서 호출할 수 있는지
  - **국토교통부 건물 공간정보(GIS건물통합정보 등)**: 존재 여부와 이용 조건
- 운영 Overpass 미러(`overpass.private.coffee`) 응답을 점검합니다. 실측 PC에서는 시간 초과가 났습니다.
  - 대체 미러 목록과 실패 시 처리 순서를 정합니다. **OSM 편집 API(v0.6)는 운영 수집에 쓰지 않습니다**(사용 정책상 대량 조회 금지, 측정에만 허용).

**완료 기준**: `node src/modules/region-quest/scripts/measure.mjs --school 애월초등학교`가 리포트 수치를 재현합니다. 2km 도로 약 103km, 보행 그래프 1덩어리, 1km 건물 92동 근처 값이 나오면 됩니다(데이터 갱신으로 다소 달라질 수 있음). 소스 문서도 작성되어 있어야 합니다.
**커밋**: `chore(region-quest): scaffold module and data-quality script`

### R1. 지역 팩 v2

**할 일**: §4.1 타입, `validateRegionPack`, `fromNeighborhoodPackV1`, `toStudentPack`, 사실 상태 전이 함수(`auto→draft→verified/rejected`, 수정 시 `verified→draft`로 되돌림)를 만듭니다. 팩 CRUD API는 기존 `neighborhoodPacksRoute` 패턴을 따릅니다.
**테스트**: 범위 밖 좌표 거부, 상한 초과 거부, v1 변환, 학생 직렬화에서 미승인 사실 제거, 수정 시 승인 해제.
**완료 기준**: `npm test`, `npm run typecheck`가 통과하고, 기존 v1 팩이 그대로 열립니다.
**커밋**: `feat(region-quest): add region pack v2 model and validation`

### R2. 수집기

**할 일**
1. **학교 검색**: 학교명 → 표준데이터 API(서버, 키는 환경변수) → 후보 목록 → 선택 시 중심점 설정. 키가 없으면 Nominatim 검색으로 대체합니다(사용 정책 준수: User-Agent 지정, 초당 1회 이하, 결과 캐시).
2. **OSM 수집**: 기존 `overpassQuery`를 확장합니다.
   - 도로 전 종류(footway, path, steps, cycleway, service, track 포함), `natural=coastline`, `building`, `landuse`, `natural`, `leisure`, `amenity`, `tourism`, `historic`, `office`를 가져옵니다.
   - 반경은 300~2,000m로 넓힙니다. 2km는 교사 확인 대화상자를 거칩니다.
   - 결과는 `regionMapCache`에 캐시합니다(키: 반올림한 중심점, 반경, 질의 버전).
3. **정규화**
   - 이름 한글 우선(`name:ko` → `name`)
   - 같은 이름의 장소 중 50m 이내 중복 병합(예: 실측에서 '제주토비스콘도' 3건)
   - OSM 태그 → `PlaceKind` 매핑표
   - 도로를 교차로에서 분할해 그래프 생성
   - 개인 상호(shop, cafe, restaurant, 숙박)는 기본 `selected:false`
4. **국가유산 수집**: 반경 안 지정유산 좌표 → `heritage` 장소, 사실 1개(지정 명칭·종목·번호·출처)를 `auto` 상태로 생성합니다.
5. **교사 추가**: 지도를 클릭해 장소를 추가하고 이름·종류·출처 URL을 입력합니다. 지점을 '불편 신호'(`game.role:'issue'`)나 '숨은 장소'로 지정할 수 있습니다.
6. **품질 배지**: 수집 직후 R0 지표를 요약해서 교사에게 보여 줍니다. 예: "건물 정보가 적어 마을 모습은 자동으로 채워요", "문화유산이 0곳이에요. 직접 추가해 주세요".

**완료 기준**
- 애월초로 수집하면 우체국·파출소·보건지소·읍사무소·도서관·애월중이 `selected:true`로 들어옵니다.
- 상호는 기본 제외됩니다.
- 국가유산 API로 들어온 장소가 있거나, 없으면 교사가 애월진성을 추가할 수 있습니다.
- Overpass가 실패하면 캐시 → 대체 미러 → 오류 안내 순서로 동작합니다.

**커밋**: 학교 검색, OSM 확장, 국가유산, 교사 추가를 각각 나눠 커밋합니다.

### R3. 검수 큐 (교사 10분 목표)

**할 일**
- 장소 목록을 카드로 보여 줍니다. 상태 배지(자동/초안/승인/제외), 출처 링크, 지도 위치 미리보기를 붙입니다.
- 사실 카드에는 *승인·수정·제외* 버튼을 둡니다.
- **AI 초안**: 화이트리스트 출처만 사용하고 문장마다 인용을 붙입니다(`CitedText`). 화이트리스트 밖 URL은 저장할 때 경고합니다.
  - 화이트리스트(설정 파일): 한국민족문화대백과(encykorea.aks.ac.kr), 디지털향토문화전자대전(*.grandculture.net), 국가유산포털(heritage.go.kr), 국가유산청, 지자체·교육청 도메인(*.go.kr), 위키백과(보조 출처, 단독 근거 불가 표시)
- 일괄 승인은 **출처가 공공기관 API인 사실에만** 허용합니다. 역사·인물 서술은 한 건씩 승인합니다.
- 진행 표시를 둡니다: "학생에게 보일 사실 12개 중 9개 승인".

**완료 기준**: 미승인 사실이 학생 API 응답에 포함되지 않는다는 서버 테스트가 통과합니다. 애월초 팩으로 교사 1명이 10분 안에 검수를 끝낼 수 있는지 측정해 기록합니다.
**커밋**: `feat(region-quest): teacher review queue with source allowlist`

### R4. 약도·백지도 스타일 엔진

**할 일**: `renderRegionMap(pack, style, options) → SVG string`을 만듭니다. 모든 출력에 방위표, 축척 막대, 출처, 기준일을 자동으로 넣습니다.

| 스타일 키 | 내용 |
|---|---|
| `blank-l1` | 완성 지도(길, 장소 기호, 이름) |
| `blank-l2` | 길 + 장소 기호, 이름 칸은 빈 네모 |
| `blank-l3` | 길 윤곽과 해안선만 |
| `textbook` | 교과서형 컬러, 도로 위계별 굵기 |
| `picture` | 그림지도 느낌. 손그림 선 흔들림 필터, 종이 텍스처, 장소는 그림 아이콘 |
| `pixel` | 게임 타일 렌더를 축소한 이미지(R5 이후) |
| `symbols` | 범례 연습용. 기호 + 범례 표 |

- 라벨 겹침을 피합니다(간단한 그리디 배치. 겹치면 지시선 또는 생략).
- PDF는 A4 세로·가로와 A3를 지원하고, 한글 폰트를 내장합니다(기존 인쇄 경로 참고).
- **이미지 생성(소량)**: `picture` 스타일용 종이 텍스처 2장, 그림 아이콘 세트(장소 종류 16종) 1아틀라스. 규격은 §6.6의 `picture-icons`를 따릅니다.

**완료 기준**: 애월초 팩으로 7개 스타일이 모두 출력되고, A4 PDF에서 라벨이 잘리지 않습니다. L3 백지도에서 장소 기호와 이름이 완전히 빠져 있어야 합니다.
**커밋**: 스타일 엔진, PDF, 그림지도 에셋으로 나눠 커밋합니다.

### R5. 타일 컴파일러 (길의 정확성 핵심)

**입력**: RegionPack v2. **출력**: §4.2 TileMap.

**규칙**: 애월초 실측에서 실패를 재현하고 확인한 규칙입니다. 모두 단위 테스트로 고정합니다.
1. **투영**: 학교를 원점으로 하는 로컬 미터 좌표를 씁니다. `x=(lon-lon0)·111320·cos(lat0)`, `y=(lat0-lat)·110540`. 1타일=5m(설정 가능 3~8m). 북쪽이 위입니다.
2. **그리는 순서**: 녹지·밭 → 해안선(별도 장벽 마스크) → 건물 → 도로(도로가 항상 위). 장소 표시는 **경로 계산이 모두 끝난 뒤**에 합니다.
3. **4방향 연결 래스터화**: 선을 칸으로 바꿀 때 x와 y가 동시에 바뀌면 모서리 칸 `(x, prevY)`를 함께 칠합니다. 이 규칙이 없으면 애월초 도달률이 **0%**, 있으면 **100%**였습니다.
   ```js
   for (let i = 0; i <= n; i++) {
     const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
     if (x !== px && y !== py) put(x, py);  // 대각선 틈 메우기
     put(x, y); px = x; py = y;
   }
   ```
4. **도로 폭**: major 3칸, minor 2칸, path 1칸. 교차로 노드 주변 3×3은 반드시 걸을 수 있는 칸으로 만듭니다.
5. **바다**: 해안선을 2칸 두께 장벽 마스크로 별도 유지합니다. 도로가 덮어 써도 마스크는 남깁니다. 바다 시드(사각형 가장자리 중 해안선 바깥쪽)에서 채웁니다. 마스크가 없으면 바다가 육지로 번졌습니다(바다 92.7% → 정상 27.8%).
6. **건물**: 외곽선은 채웁니다. 외곽선이 없는 블록(도로로 둘러싸인 다각형)은 `theme.region`에 따라 **절차적으로 채웁니다**.
   - 제주: 밭담 격자 + 귤밭 + 초가·슬레이트 주택
   - 도시: 주택·상가
   - 농촌: 논밭·비닐하우스
   - 시드는 블록 ID로 고정해서 매번 같은 모습이 나오게 합니다.
7. **랜드마크**: 장소마다 `door` 칸(가장 가까운 걸을 수 있는 칸)을 계산합니다. 스프라이트 발자국(예: 3×3)이 도로를 막지 않게 배치합니다.
8. **도달 검사**: 학교 spawn에서 BFS를 돌려 선택된 모든 장소의 `door`에 도달해야 합니다. 실패하면 컴파일 결과에 `unreachable` 목록을 넣고, 교사 화면에 "길이 끊긴 곳" 경고와 *자동 연결(가장 가까운 도로까지 오솔길 생성)* 버튼을 보여 줍니다.
9. **청크**: 32×32 단위 RLE + base64. 2km×2km를 5m 타일로 만들면 400×400(청크 13×13)입니다.
10. **오토타일**: 도로, 해안, 물, 밭담 경계는 4비트(16타일) 또는 47타일 블롭 규칙으로 정합니다. 아틀라스 셀 번호는 §6.6과 일치시킵니다.

**성능 목표**: 2km 팩 컴파일을 서버에서 3초 안에 끝냅니다. 결과는 `packUpdatedAt`별로 캐시합니다.
**테스트**: 대각선 도로 연결, 해안선 마스크, 도로가 건물을 덮는 순서, 애월 fixture 도달률 100%, 같은 입력이면 같은 checksum.
**완료 기준**: 애월초 팩에서 선택 장소 100% 도달, 바다·육지 비율이 실측 범위, 디버그 PNG 출력(`src/modules/region-quest/scripts/render-debug.mjs`)으로 육안 확인.
**커밋**: 래스터화·바다, 절차적 채우기, 오토타일·청크를 나눠 커밋합니다.

### R6. 아트 파이프라인 (이미지 생성)

§6 전체를 따릅니다. 순서는 다음과 같습니다.
1. 스타일 바이블 확정
2. 시험 아틀라스 1장(지형 기본)으로 후처리 검증
3. 전체 아틀라스 생성
4. 검수 시트 작성
5. `public/region-quest/` 배포용 산출물과 manifest 커밋

**완료 기준**: §6.8 검수 체크리스트 전 항목 통과. 게임에서 이음새, 투명 테두리, 색 번짐이 보이지 않아야 합니다.

### R7. 게임 런타임

**구조**
- 러닝킹과 같이 **iframe 격리**로 만듭니다.
  - 교사 미리보기: 교사 인증 후 HTML을 제공합니다.
  - 학생 실행: 학생 인증과 학급 배정을 확인한 뒤 HTML을 제공합니다.
- 부모 창과는 `postMessage`로만 통신합니다. 메시지 종류: `load-pack`, `progress-load`, `progress-save`, `session-update`, `close`, `export-map`.
- Canvas2D 자체 렌더러를 씁니다. 외부 게임 엔진은 넣지 않습니다(번들 경량화). `image-rendering: pixelated`, 정수 배율(×2~×4) 확대.

**필수 시스템**

| 시스템 | 요구 사항 |
|---|---|
| 로더 | TileMap 청크를 카메라 주변 3×3만 디코딩하고, 아틀라스는 manifest로 로드 |
| 이동 | 키보드(방향키/WASD), 화면 조이스틱(기존 전시실 조이스틱 구현 참고), **클릭/탭 이동**(A* 경로, 걸을 수 있는 칸만) |
| 충돌 | collision 레이어. 대각선 이동 속도 보정 |
| 카메라 | 플레이어 추적, 맵 경계 고정, 확대 2단계 |
| 안개 = 백지도 | 처음에는 `blank-l3` 모습(길 윤곽만 흐리게). 플레이어 주변 반경 6칸이 드러나고 `revealed` 비트셋에 기록. 장소 임무를 완료하면 그 장소 아이콘과 이름이 색으로 돌아옴 |
| 상호작용 | `door` 칸에 닿으면 말풍선 아이콘 → 대화. NPC는 2~3줄씩, 읽어 주기(TTS, 기존 음성 기능 재사용 가능 여부 확인) |
| 미니맵 | 능력 단계별로 변화: 없음 → 방위표 → 지도 기호 → 축척 막대 → 등고 → 옛 지도 레이어 |
| 해넘이 | 수업 세션 `sunsetAt` 5분 전부터 하늘색 변화, 도달하면 "학교로 돌아가자" → 학교로 자동 경로 안내 → 정리 화면 |
| 저장 | 30초마다, 그리고 장소 완료 시 `progress-save`. 실패해도 메모리로 계속 진행 |
| 정리 화면 | 내 지도(드러난 길 + 완료 장소) 미리보기, 장소 일기, `export-map` |

**성능**: 저사양 크롬북·태블릿에서 60fps(최소 30fps). 첫 화면까지 3초 이내(학교 주변 청크 우선). 아틀라스 총 4MB 이하.
**완료 기준**: 애월초 팩으로 학교 출발 → 우체국 도착 → 대화 → 안개 복원 → 저장 → 새로고침 후 이어하기까지 동작합니다. 키보드·터치·클릭 이동을 모두 확인합니다.
**커밋**: 렌더러, 이동·충돌, 안개, 상호작용·대화, 미니맵·해넘이, 저장을 나눠 커밋합니다.

### R8. 퀘스트 엔진과 콘텐츠

**퀘스트는 데이터(JSON)로 정의**하고, 엔진은 상태 기계로 만듭니다.

```ts
type QuestStep = {id: string; goal: {type: 'reach' | 'talk' | 'answer' | 'collect' | 'photo' | 'diary' | 'idea'; placeId?: string; itemKey?: string; question?: {prompt: string; choices: string[]; answer: number; skill?: 'direction' | 'symbol' | 'scale'}}; hint: {direction: boolean; text: string}; reward?: {ability?: string; card?: string; mapPiece?: number}};
type Quest = {id: string; kind: 'story' | 'daily-life' | 'collect' | 'explore' | 'issue'; title: string; steps: QuestStep[]; curriculum: string[]; requiresVerifiedFacts: string[]};
```

- **템플릿 자동 생성**(장소 종류별): post→편지 배달(주소·방위), police→잃어버린 물건, office→주민 부탁, library→우리 동네 책, clinic→건강 지키는 곳, harbour/market→동네 사람들이 하는 일, peak/viewpoint→높이 눈 방위 퀘스트, heritage→옛 지도 조각, issue→동네 고치기.
- **능력 성장**: compass(학교 전망 퀴즈) → symbols(기호 맞히기) → scale(학교→우체국 걸음 수 추정, 애월 실측 약 285m) → height → oldmap(이야기 체인 완료).
- **세 갈래 목표판**: 이야기·수집·탐험 중 미완료를 하나씩 추천합니다. 2분 동안 진행이 없으면 *방위 힌트*를 줍니다.
- **이야기 체인 「성담의 비밀」(애월초 fixture)**: 학교 담장(애월진성 성벽) → 우체국 → 애월항 → 애월환해장성 → 한담 산책로·장한철 생가와 표해록 기적비 → 학교 귀환 후 옛 지도 레이어. 대사는 검수된 사실만 참조해서 만듭니다. fixture 사실은 모두 `draft`로 넣고 "교사 검수 필요"를 표시합니다.
- **AI 대사 생성**: 입력은 해당 장소의 `verified` 사실 목록뿐입니다. 출력은 대사 2~3줄과 사용한 사실 ID입니다. 사실 ID가 없는 문장은 버립니다.
- **이미지 생성**: 장소 카드 일러스트(§6.6 `place-cards`), 옛 지도 조각 4장(`oldmap-pieces`).

**완료 기준**: 애월 fixture로 체인 6단계를 끝까지 진행할 수 있습니다. 미승인 사실만 있는 장소의 퀘스트는 생성되지 않습니다(테스트). 템플릿 퀘스트가 장소 종류마다 1개 이상 생성됩니다.

### R9. 교실 연동

- **팩 배정**: 교사가 팩을 학급에 배정하면 서버가 `toStudentPack` + TileMap을 게시합니다(`regionPacksPublished`).
- **학생 진입**: 학생 홈의 배정 활동 목록에서 시작합니다. 기존 학생 인증을 그대로 쓰고, 별도 가입은 없습니다.
- **수업 통제**(교사 화면): 시작, 모두 멈춤, 모두 학교로 귀환, 구역 열기/닫기, 오늘 퀘스트 지정, 해넘이 시각 설정(기본 시작 후 25분). `classes/{classId}/regionSessions/{packId}` 문서를 실시간 구독하고, iframe에는 `session-update`로 전달합니다.
- **교사 진행 보기**: 학생별 *완료 장소 수, 막힘 여부(5분 무진행)*만 보여 줍니다. 실시간 위치는 표시하지 않습니다. 막힌 학생에게 힌트 1회를 보낼 수 있습니다.
- **학급 공동 지도**: 학생 `revealed`의 합집합과 학급 복원률(%)을 전자칠판용 전체 화면으로 보여 줍니다. 순위표는 기본으로 끕니다.
- **장소 일기 → 갤러리**: 장소 사진기 스냅샷(픽셀 장면 캡처)과 한 줄 일기를 기존 전시·갤러리 흐름에 학급 단위로 게시합니다(교사 승인).
- **동네 고치기 → 투표**: 학생 아이디어를 모아 기존 `class-poll`로 투표를 만듭니다.
- **포인트 연동**: 교사 설정으로만 켭니다. 기본은 꺼짐입니다.

**완료 기준**: 교사 1명과 학생 계정 3개로 배정 → 동시 플레이 → 멈춤/귀환 → 공동 지도 갱신 → 일기 게시 → 투표 생성까지 동작합니다. 다른 학급 학생은 접근이 거부됩니다(규칙 테스트).

### R10. 출력·평가

- **내 지도 PDF**: 드러난 길, 완료 장소 기호, 이름 칸(손으로 쓰도록 빈칸 옵션), 방위표, 축척, 출처, 학생 이름(선택).
- **개인 포트폴리오**: 내 지도, 장소 일기, 능력 획득 기록, 동네 고치기 아이디어.
- **성취기준 리포트**: `class-report`에 항목 추가(§전략 문서 6.7 매핑). 예: [4사01-01] 장소 일기 작성률, [4사01-02] 아이디어 제출률, 지도 능력 퀴즈 정답률, 방위 힌트 없이 도착한 비율.
- 성취기준 코드와 문구는 NCIC 원문으로 확인한 뒤 `content/curriculum.ts`에 출처와 함께 둡니다. 원문을 확인하지 못한 항목은 코드 없이 표시합니다.

### R11. QA·출시

- **테스트**: 순수 함수 단위 테스트(R1·R5·R8 필수), API 권한 테스트, 규칙 테스트, `npm run build`.
- **기기**: 크롬북(저사양), 안드로이드 태블릿, 아이패드 Safari, 전자칠판 브라우저, 데스크톱 Chrome/Edge. 기기별 fps와 첫 로딩 시간을 기록합니다.
- **접근성**: 키보드만으로 전체 진행, 대화 글자 크게, 읽어 주기, 색만으로 구분하지 않는 미니맵, 깜박임 없음.
- **개인정보 안내 1장**: 수집 항목(진도, 일기 텍스트, 장면 스냅샷)과 미수집 항목(GPS, 사진, 채팅)을 정리합니다. 교사가 학교에 제출할 수 있는 형태로 만듭니다(전략 문서 P7).
- **출시 방식**: 처음에는 교사 미리보기 전용 베타로 엽니다(러닝킹과 같은 방식). 학생 배정 기능은 시범 학급 검증 후 플래그로 엽니다.
- **보고**: 단계마다 *커밋 해시, 푸시 여부, 자동 배포 상태(확인한 시각), 검증한 것, 검증하지 못한 것*을 분리해서 보고합니다.

---

## 6. 이미지 생성 규격 (R4·R6·R8)

### 6.1 원칙
- **생성 → 후처리 → 검수 → 등록** 4단계를 거칩니다. 생성 원본을 그대로 쓰지 않습니다.
- 한 번에 큰 아틀라스 1장을 생성하지 않습니다. **주제별 작은 아틀라스(셀 4×4 이하)**로 나눠 생성하고, 후처리로 합칩니다. 생성 모델은 격자 정렬과 픽셀 정확도가 약하기 때문입니다.
- 모든 생성 기록은 `src/modules/region-quest/assets/generation-prompts.json`에 남깁니다(기존 `docs/character-attachment-prompts.json` 형식 준수: tool, version, asset key, 프롬프트 전문, 참조 이미지, 원본 파일명, 후처리 파라미터, 검수 결과).
- 대용량 원본(생성 PNG 묶음)은 커밋하지 않습니다. 커밋 대상은 최종 아틀라스, manifest, 프롬프트 기록, 검수 시트입니다.
- 실존 브랜드, 로고, 상호, 실존 인물 사진풍 초상은 생성하지 않습니다. 역사 인물(장한철 등)은 **특정 얼굴을 주장하지 않는 귀여운 상징형 캐릭터**로 만들고, "상상해서 그린 모습" 표기를 붙입니다.

### 6.2 스타일 바이블 (먼저 1장 생성해서 확정)
- 탑다운 3/4 시점의 귀여운 2D 픽셀 아트입니다. 따뜻하고 부드러운 그림책 느낌이고, 아동용으로 위협적인 요소가 없습니다.
- 기본 타일은 **16×16 px**, 화면에서는 정수 배율 ×3로 표시합니다. 캐릭터는 16×24 px(머리가 큰 2.5등신)입니다.
- **팔레트 32색 고정**(`src/modules/region-quest/assets/palette.hex`): 바다·하늘 계열 4, 풀·숲 5, 흙·길 4, 돌·담 4, 지붕 6(주황, 청록, 남색, 회색, 초가 짚색, 적갈), 피부·옷 5, 외곽선과 그림자 4. 외곽선은 순검정 대신 진한 갈보라색을 씁니다.
- 광원은 왼쪽 위입니다. 그림자는 오른쪽 아래 1px, 팔레트의 그림자색만 씁니다.
- 기존 12캐릭터(`public/characters`)의 색감과 성격을 픽셀 아바타로 옮깁니다.
- 결과물 `src/modules/region-quest/assets/style-bible.png`: 팔레트 견본, 지형 샘플 3×3, 집 1채, 캐릭터 1명, UI 패널 1개를 담은 1장.

### 6.3 생성 프롬프트 공통 머리말 (영문, 모든 요청 앞에 붙임)

```
Use case: game asset sprite atlas for a cute top-down 2D pixel-art RPG for Korean elementary school children.
Style: clean pixel art, 16x16 pixel grid per tile, rendered large with crisp hard pixel edges, NO anti-aliasing, NO blur, NO gradients, NO text, NO letters, NO watermark, NO logos.
Camera: top-down 3/4 view, light from top-left, 1-pixel dark purple-brown outlines (not pure black), soft warm storybook palette limited to the attached palette swatch.
Layout: exactly {COLS} columns x {ROWS} rows of equal square cells on a plain flat #FF00FF magenta background (for keying), each object centered and fully inside its cell with 2-pixel padding, no overlap, no grid lines drawn.
Reference image 1 is the style bible: match its palette, outline weight and proportions exactly. Reference is style only, not an edit target.
```

(투명 배경을 직접 요구하면 반투명 테두리가 생기기 쉽습니다. 그래서 **마젠타 단색 배경 + 후처리 키잉**을 기본으로 합니다. 도구가 진짜 알파를 안정적으로 지원하면 바꿔도 됩니다.)

### 6.4 후처리 스크립트 `src/modules/region-quest/scripts/atlas-postprocess.mjs` (sharp 사용)
1. 셀 분할: 원본을 COLS×ROWS로 균등 분할합니다.
2. 키잉: #FF00FF 근처(ΔE<30)는 투명으로, 경계 1px의 마젠타 오염은 가까운 불투명 색으로 대체합니다.
3. **픽셀 격자 복원**: 셀을 nearest-neighbor로 16×16(캐릭터는 16×24)까지 축소합니다. 축소 전에 셀 안 그림의 실제 픽셀 크기를 추정해(가장 흔한 색 경계 간격) 정렬합니다.
4. **팔레트 고정**: 모든 픽셀을 32색 팔레트의 가장 가까운 색으로 양자화합니다(디더링 없음). 알파는 0 또는 255로 이진화합니다.
5. **이음새 검사**(지형 타일): 같은 오토타일 세트의 인접 경계 색이 일치하는지 자동 비교하고, 불일치 셀 목록을 출력합니다.
6. 최종 아틀라스로 패킹(셀 번호 고정), `manifest.json`에 `{key, atlas, x, y, w, h, frames?}`를 기록합니다. `webp`(무손실)와 `png`로 출력합니다.
7. 검수용 확대 미리보기(×6)와 체커 배경 미리보기를 생성합니다(커밋하지 않음).

### 6.5 수작업 보정 허용 범위
- 생성 결과가 격자나 오토타일 규칙을 못 맞추면 **코드로 그린 타일**(단색 + 팔레트 패턴)로 대체할 수 있습니다. 특히 도로·물·해안 오토타일은 절차 생성이 더 안정적일 수 있습니다. 둘 중 품질이 좋은 쪽을 고르고 기록합니다.
- 같은 셀을 3회 재생성해도 실패하면 대체 방식으로 넘어갑니다. 무한 재시도는 하지 않습니다.

### 6.6 에셋 목록

| 키 | 셀 구성 | 수량 | 내용 | 비고 |
|---|---|---|---|---|
| `style-bible` | 자유 | 1 | §6.2 | 가장 먼저 |
| `terrain-base` | 4×4 | 16 | 풀 2변형, 흙길, 포장도로, 보도블록, 모래, 자갈, 논, 밭 흙, 꽃밭, 잔디 운동장, 주차장, 다리, 계단, 횡단보도 2방향 | |
| `terrain-autotile-road` | 4×4 | 16 | 포장도로 4비트 오토타일 | 절차 생성 대체 허용 |
| `terrain-autotile-water` | 4×4 ×2 | 32 | 바다·해안 4비트 + 하천 4비트 | 파도 2프레임은 별도 |
| `jeju-set` | 4×4 | 16 | 밭담(현무암 돌담) 직선·모서리·T자·십자, 귤나무 2, 귤밭 바닥, 초가지붕 집 2방향, 슬레이트 지붕 집, 정낭, 돌하르방(작은 장식), 용천수 우물, 해녀 테왁 장식, 방사탑 | 지역 타일셋 1호 |
| `urban-set` | 4×4 | 16 | 아파트 동 2, 상가 2, 주택 3, 버스정류장, 신호등, 가로수 2, 벤치, 놀이터 기구 2, 편의시설 | 도시 학교용 |
| `rural-set` | 4×4 | 16 | 논 물, 비닐하우스, 창고, 경운기 장식, 마을회관, 정자, 장승, 저수지 가장자리 등 | 농촌 학교용 |
| `landmarks-public` | 4×4 | 16 | 학교(운동장 포함 3×3칸 큰 스프라이트), 읍·면·동 사무소, 우체국, 파출소, 소방서, 도서관, 보건소, 시장, 항구 등대, 방파제 끝, 버스터미널, 공원 정자, 체육관, 마을회관, 교회·절 대신 '모이는 집'(중립) | 실제 기관 로고 금지, 기능이 드러나는 귀여운 외형 |
| `landmarks-heritage` | 4×4 | 16 | 성벽 직선·모서리·문, 연대(봉수대 돌 구조), 비석, 옛 초가, 성곽 돌담 일부, 고인돌, 옛 우물, 정자, 기념비 받침, 옛 포구 돌 계단 등 | 특정 문화재 정밀 재현 아님(상징형) |
| `nature` | 4×4 | 16 | 오름(작은 언덕) 2, 바위 3, 해송 2, 동백, 억새, 꽃 2, 갈매기, 물웅덩이, 표지판(글자 없음) 등 | |
| `player-avatars` | 프레임 시트 | 12캐릭터 × 4방향 × 3프레임 | 기존 12캐릭터 픽셀화 | 캐릭터 1명당 1요청(4×3 셀) |
| `npcs` | 4×3 프레임 | 10명 | 우체부, 경찰관, 소방관, 주민센터 직원, 사서, 보건소 간호사, 어부, 해녀 할망, 시장 상인, 옛 선비(장한철 상징형) | 4방향 대기 프레임만 |
| `spirit` | 4×4 | 1세트 | 바람 정령 '지움이' 대기·날기·웃음·놀람 | 세계관 템플릿별로 추가 |
| `items-icons` | 4×4 | 16 | 나침반, 기호 렌즈, 발걸음 자, 높이 눈, 옛 지도 돋보기, 편지, 잃어버린 물건 3, 지도 조각, 도감 카드, 별, 하트, 물음표, 느낌표, 카메라 | 12×12도 가능 |
| `map-symbols` | 4×4 | 16 | 학교, 관공서, 우체국, 경찰, 소방, 도서관, 병원, 문화유산, 관광지, 항구, 시장, 산, 공원, 버스, 다리, 화장실 | 교과서식 단순 지도 기호, R4 symbols 스타일과 공유 |
| `ui-kit` | 9-slice | 1세트 | 대화창, 목표판, 버튼 3상태, 미니맵 프레임, 해넘이 하늘 그라데이션 띠(팔레트 단계), 진행 막대 | |
| `fx` | 4×4 | 16 | 안개 경계 4비트, 발자국, 반짝임 3프레임, 지도 복원 물감 번짐 4프레임 | |
| `place-cards` | 일러스트 | 장소 종류 16 + 애월 특별 6 | 도감 카드 그림(픽셀 64×64) | 장소 종류별 공용 + 시범 지역 특별 |
| `oldmap-pieces` | 2×2 | 4 | 옛 지도 조각(합치면 1장) | 옛 지도 레이어 텍스처 포함 |
| `picture-icons` | 4×4 | 16 | R4 그림지도용 수채·크레용풍 아이콘(픽셀 아님) | 별도 머리말: watercolor crayon children's map icon style |
| `paper-textures` | – | 2 | 그림지도 종이, 옛 지도 종이 | 무늬 반복 가능(tileable) |

**대략적인 생성 횟수**: 아틀라스 약 40요청 + 재생성 여유 30% → **약 50~60요청**입니다. 지역 타일셋을 추가할 때는 1세트에 약 3~4요청이 듭니다.

### 6.7 프롬프트 예시

**`jeju-set` 본문** (공통 머리말 뒤에 붙임, COLS=4 ROWS=4)
```
Reading order, left to right, top to bottom:
1 straight horizontal low dry-stone wall made of dark porous basalt stones (Jeju batdam), 2 straight vertical basalt wall,
3 basalt wall corner, 4 basalt wall T-junction, 5 basalt wall cross junction,
6 small round tangerine tree with orange fruits, 7 second tangerine tree variant, 8 tangerine orchard soil ground tile (seamless),
9 tiny traditional Jeju thatched-roof stone house facing down, 10 same house facing right,
11 small house with grey slate roof, 12 three wooden poles gate (jeongnang) between two stone posts,
13 tiny friendly stone grandfather statue (dol hareubang) as decoration, 14 natural spring water stone pool,
15 orange round float (tewak) with net as decoration, 16 small conical stone tower (bangsatap).
Ground tiles must tile seamlessly; objects sit on transparent (magenta) background.
```

**`player-avatars` 본문** (캐릭터 1명당, COLS=3 ROWS=4)
```
Character: pixel version of reference image 2 ({CHARACTER_NAME}), keep its colors, ears and personality; chibi 2.5-head proportions, 16x24 pixel sprite.
Rows: walking down, walking left, walking right, walking up. Columns: step-left frame, standing frame, step-right frame.
Same size and baseline in every cell, feet aligned to the bottom 2 pixels of each cell.
```

**`npcs` 본문 (예: 해녀 할망)**
```
Friendly elderly Korean woman sea diver (haenyeo) in black diving suit with orange float, warm smile, cute chibi pixel sprite 16x24,
Rows: facing down, left, right, up. Single idle frame per row (4 columns x 1 row), consistent size and baseline.
```

**`place-cards` 본문 (예: 우체국)**
```
64x64 pixel-art collectible card illustration: a cute small post office building with a red mailbox and a smiling mail carrier waving, sunny day, simple background,
no text, no logo, no real brand colors, centered, same palette and outline weight as reference.
```

### 6.8 검수 체크리스트 (에셋마다 기록: `src/modules/region-quest/assets/review-sheet.md`)
- [ ] 16px 격자에 정확히 맞음(흐린 픽셀, 중간색 테두리 없음)
- [ ] 팔레트 32색 밖의 색 0개(스크립트 검사)
- [ ] 알파가 0 또는 255
- [ ] 오토타일 이음새 검사 통과
- [ ] 캐릭터 프레임 간 크기·발 위치 일치(스크립트 검사)
- [ ] 글자, 로고, 실존 브랜드 없음
- [ ] 아동에게 무섭거나 부적절한 표현 없음, 특정 집단 고정관념 없음
- [ ] 문화유산·지역 상징이 왜곡되거나 희화화되지 않음
- [ ] 게임 화면 ×3 배율에서 실제로 확인(스크린샷 첨부, 커밋 안 함)

---

## 7. 환경변수 (실값은 커밋 금지, Vercel 환경변수에만 등록)

| 이름 | 용도 | 없을 때 |
|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 학교 위치 표준데이터, 국가유산 위치 API | 학교 검색은 Nominatim, 국가유산은 교사 추가만 |
| `TOUR_API_KEY` | 관광지(선택) | 관광지 자동 수집 생략 |
| `NGII_API_KEY` | 국토지리정보원 배경지도(선택) | OSM만 사용 |
| `REGION_QUEST_OVERPASS_URLS` | 쉼표로 구분한 미러 목록 | 기존 기본값 |
| `REGION_QUEST_ENABLED` | 교사 미리보기 기능 플래그 | 모듈 전체 숨김, API 404 |
| `REGION_QUEST_STUDENT_ENABLED` | 학생 배정 기능 플래그 | 교사 미리보기만 |

---

## 8. 사용자 결정이 필요한 항목 (작업 시작 전 확인)
1. 공공데이터포털·TourAPI·국토지리정보원 키 발급 여부(키 발급은 사용자가 직접 진행)
2. 이미지 생성 사용량·비용 한도(약 50~60요청 + 지역 추가분)
3. 첫 공개 범위: 교사 미리보기 베타만 할지, 시범 학급(애월초)까지 할지
4. 포인트 보상 연동 여부(기본 꺼짐 제안)
5. 교사 간 지역 팩 공유(ODbL 공유 의무 검토 필요): 이번 범위에서 제외할지

---

## 9. 최종 완료 정의
- 교사가 애월초를 검색해 10분 안에 팩을 검수하고, 백지도 L1~L3 PDF를 출력합니다.
- 같은 팩으로 학생 3명이 동시에 게임을 진행합니다.
  - 안개가 걷히며 지도가 복원됩니다.
  - 「성담의 비밀」 체인을 완주할 수 있습니다.
  - 해넘이로 수업이 정리됩니다.
  - 내 지도 PDF와 장소 일기가 남습니다.
  - 학급 리포트에 성취기준별 근거가 표시됩니다.
- 미승인 사실은 학생 화면과 학생 API 어디에도 나오지 않습니다.
- 모든 출력물에 출처와 기준일이 표시됩니다.
- `npm test`, `npm run typecheck`, `npm run build`가 통과하고, 기능별로 커밋·푸시하며, 자동 배포 상태를 확인해서 보고합니다.
