# 애월 연속 지도 샘플 데이터

`aewol.json`은 2026-10-27 기존 애월 실측에 사용한 OpenStreetMap XML 추출본을 로컬에서 가공한 데이터입니다. 새 네트워크 요청이나 지도 API 호출은 하지 않았습니다. 원본 `map1km.osm`은 모듈의 Git 제외 `.cache/aewol-source-map1km.osm`에 보관합니다.

## 좌표와 렌더링 계약

- 원점: 위도 33.46512, 경도 126.32235.
- 지구 반지름 6,371,008.8m의 로컬 등장방형 투영. `x`는 동쪽, `y`는 남쪽이며 단위는 미터입니다. 회전·도로 이동·구간별 거리 축소를 하지 않았습니다.
- `extent`: `minX=-178`, `minY=-327`, `maxX=389`, `maxY=117`.
- 6px/m, 사방 180px 패딩을 쓰면 `screenX=(x-minX)*6+180`, `screenY=(y-minY)*6+180`, 월드 크기는 3762×3024px입니다.
- 길 폭과 장식 외관은 게임 표현으로 조절할 수 있지만 `roads[].points`와 `route.points`의 중심선은 유지합니다.

## API

| 필드 | 내용 |
| --- | --- |
| `selectedRoute` | `coast` |
| `route.points`, `route.nodeIds`, `route.lengthMeters` | 실제 도로를 잇는 28개 점, 원본 노드 ID, 길이 420.92m |
| `spawn` | 학교 출발점보다 같은 실제 도로를 따라 서쪽으로 45m 뒤의 시작점. 학교 그림과 캐릭터가 겹치지 않도록 시작 위치만 조정 |
| `stops` | `school` 출발점, `bend` 162.20m 지점, `coast` 420.92m 도착점. 모두 도로 위 좌표 |
| `roads` | 33개 주변 도로의 ID·이름·종류·원본 노드·투영 좌표 |
| `buildings` | 49개 건물 외곽. 개인 주택·상점 이름은 포함하지 않음 |
| `polygons` | 학교 부지·운동장 등 6개 영역 |
| `coastlines` | OSM 순서 그대로 연결되는 2개 해안선. 좌표 일부는 extent 바깥 |
| `seaPolygons` | 해안선 2개를 연결하고 북쪽 바다를 extent로 클립한 수면 폴리곤. Canvas fill에 사용 가능 |
| `landmarks` | 학교·우체국·항구의 OSM 위치 및 가까운 도로점. `coast`는 샘플 도착점이며 공식 지명이 아님 |
| `alternativeRoutes` | 비교용 학교→우체국(226.94m), 항구 지도핀 인근 도로(782.29m), 선택한 해안 도착점(420.92m) |
| `source` | 출처·라이선스·원본 SHA-256·수집일·제약사항 |

학교 출발점은 `(-17.866,-43.989)`, 굽이 단서는 `(135.348,-57.265)`, 해안 도착점은 `(171.664,-166.759)`입니다. 도착점은 원본 OSM 노드 `2940172180`이며 가장 가까운 해안선까지 약 14.7m입니다. 학교/우체국의 가까운 도로점은 실제 출입구를 조사해 확정한 좌표가 아닙니다.

## 보존과 한계

원본 도로 중심선과 교차로의 노드 연결을 사용하며, 반경의 범위만 선택했습니다. 좌표는 소수 셋째 자리 미터로 반올림했습니다. 그림을 예쁘게 보이게 하려고 길을 휘거나 옮기지 않았습니다.

이 경로는 게임 샘플용입니다. 보도·횡단보도·통행 제한·건물 출입구를 현장 검증한 보행 안내가 아닙니다. `foot=no/private`, `access=no/private`, 고속도로 종류는 제외했지만 보행 허용 태그가 없는 자전거길도 포함됩니다. 건물과 토지 정보가 부족해 배치하는 일반 주택·나무·담장은 설명용 미술이며 실제 외관을 재현했다고 표시하면 안 됩니다.

지도 데이터: **© OpenStreetMap contributors**, [ODbL 1.0 및 출처](https://www.openstreetmap.org/copyright). 원본 노드 편집자 이름이나 UID는 가공 데이터에 포함하지 않습니다. 게임 화면에도 출처 표시를 유지합니다.

재현:

```powershell
python src/modules/region-quest/scripts/prepare-continuous-map.py src/modules/region-quest/.cache/aewol-source-map1km.osm
node --test src/modules/region-quest/tests/continuous-data.test.mjs
```
