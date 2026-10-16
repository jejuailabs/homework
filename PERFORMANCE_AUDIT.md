# 메뉴 전환·캐시·리전 진단 — 2026-10-16

운영 배포 dpl_A4m8DjzbsBPhqM7NdhHJ364mMtjX에서 확인했다. 이 작업은 진단이며 앱 코드·운영 설정·권한 규칙을 바꾸지 않았다. 기존 검증용 학급을 읽었고 브라우저의 앱 API 변경 요청은 차단했다. 학생 이름·답안·코드·인증값은 진단 결과에 기록하지 않았다.

## 실제 리전

Firestore metadata의 locationId는 asia-northeast3, Storage bucket metadata의 location은 ASIA-NORTHEAST3이다. 모두 서울이다. 운영 API 응답 x-vercel-id의 실행 부분도 icn1이다. Vercel vercel.json도 icn1을 지정한다. 빌드를 수행한 미국 빌드 머신 위치와 실제 함수 실행 위치는 다르다. Firebase Auth 위치를 서울로 변경한 것은 아니며, DB·Storage 리전과 별개다.

## 현재 캐시

- 정적 JavaScript: public,max-age=31536000,immutable, CDN HIT 확인. 화면 코드 전체를 매번 다시 다운로드하는 구조는 아니다.
- HTML과 캐릭터 WebP: public,max-age=0,must-revalidate, CDN HIT. ETag가 있어 재검증할 수 있다. 확인한 HTML 31~67ms, JS 64~67ms, 캐릭터 50~139ms였다. 클라이언트 메모리 캐시 적중률이나 모든 이미지의 속도를 뜻하지 않는다.
- 인증된 학급·과제·전시·카드·보말·Tools API: no-store 또는 private,no-store. 개인 응답을 공유 CDN에 저장하지 않는 것은 유지해야 한다.
- 페이지를 떠나면 해당 컴포넌트 상태가 사라지고, 메뉴 재진입 시 useEffect에서 같은 API를 다시 호출한다. 같은 사용자 전용 데이터의 재사용 계층은 없다.
- Next Link의 경로 미리 읽기와 개인 API 데이터 캐시는 별개다. cards/points처럼 searchParams를 사용하는 동적 페이지의 RSC는 추가 조회될 수 있다. 이번 관측의 RSC 60~106ms보다 개인 API 체인이 더 큰 지연을 차지했다.
- 전시용 가공 사진은 private,max-age=300이다. 상세 조회마다 새 만료 시각으로 서명 URL을 발급하므로 같은 작품의 URL이 달라져 브라우저 재사용이 제한될 수 있다. 이는 소스 확인 사항이며 이번 메뉴 검사에서 작품 사진 다운로드는 따로 정량 측정하지 않았다.

## 운영 측정

API 8종을 3회씩 측정했다. 반복 요청은 대체로 약 0.58~0.85초였고 첫 전시 조회는 1.743초였다. 응답은 66~908바이트로 작아 파일 크기가 주된 이유로 보이지 않는다. 이 수치는 당시 테스트 계정·네트워크의 관측값이며 전체 사용자의 평균이 아니다.

메뉴는 클릭부터 마지막 기본 데이터 응답 완료 및 두 번의 animation frame까지 측정했다. 본문 일부는 그 전에 나타날 수 있으며, 표는 첫 표시 시간이 아니다. 테스트용 headless Edge의 단일 재방문 측정이다.

| 재방문 메뉴 | 기본 데이터 준비 | 앱 API GET 수 |
| --- | ---: | ---: |
| dashboard-return | 2566ms | 3 |
| homework-return | 2258ms | 3 |
| cards-return | 2753ms | 4 |
| tools-return | 2293ms | 4 |

숙제는 /api/me → /api/classes → /api/assignments로 세 단계다. Tools는 /api/me → preferences와 classes 병렬 → 학생 명단으로 세 단계다. 카드놀이는 /api/me → library와 classes 병렬 → distributions로 세 단계다. 재방문에서도 같은 요청을 반복했다. 첫 카드놀이 진입은 library API 2.658초를 포함해 4.523초였다. 보드 첫 진입에는 API 응답보다 클릭·전환 시간이 길어 3D 화면 전환·브라우저 작업 등 별도 원인이 섞일 수 있고, 이번 측정만으로 그 내부 원인을 확정하지 않는다.

## 인증 중복

src/lib/server/auth.ts의 getContext는 verifySessionCookie(cookie,true)를 실행한 뒤 contextForUid에서 auth.getUser를 다시 호출한다. 설치된 firebase-admin의 verifySessionCookie(true)는 내부적으로 이미 getUser를 호출한다. 따라서 정상 요청마다 같은 계정의 Auth 조회가 두 차례 순차 수행된다. 로컬에서 warmed Auth getUser는 278~301ms였고, profile Firestore 읽기는 warmed 43ms였다. 운영 함수 내부 세부 구간 계측은 하지 않았으므로 이 로컬 시간 전체를 운영 지연에서 뺄 수 있다고 단정하지 않는다.

## 개선 우선순위

1. Firebase Auth 계정 조회를 요청당 한 번으로 합친다. 토큰 서명·만료·철회·계정 정지·Google 제공자·학생 인증 버전·명단 상태 확인은 유지한다. 철회 확인을 단순히 끄는 수정은 피한다.
2. 같은 탭·로그인 사용자 전용 메모리에서 학급·명단·목록을 짧게 재사용하고 변경 성공 시 관련 캐시를 즉시 무효화한다. 로그인 전환·로그아웃·권한 거부 시 지우며 학생 코드 원문·개별 답안은 범용 캐시에 넣지 않는다. 재입장에는 기존 목록을 먼저 표시하고 필요한 갱신을 뒤에서 한다.
3. 메뉴별 인증 확인과 데이터 bootstrap을 통합해 순차 왕복을 줄인다. 현재 전시·보드 bootstrap 방식이 참고가 된다. 개인정보 API의 no-store를 public 캐시로 바꾸는 방식은 사용하지 않는다.
4. 첫 진입 경로 loading 경계·필요 시 미리 읽기, 전시 3D 재구성 비용과 서명 이미지 URL 재사용을 별도 측정한다. 불필요한 모든 메뉴 데이터 선조회는 Firestore 읽기 비용을 늘리므로 피한다.

근거: 비공개 .qa/menu-loading-audit-results.json, .qa/menu-cache-headers.json. 브라우저 페이지 오류는 0건이다. 이번 요청에서는 진단만 완료했고 개선 코드는 아직 적용하지 않았다.

## 2026-10-16 개선 구현 (운영 미반영)

정상 운영 인증 경로에서 `verifySessionCookie(false)`로 서명·발급자·만료를 확인한 뒤, provider 검사에 쓰는 같은 최신 UserRecord로 철회 시각·정지를 확인하도록 중복 조회를 합쳤다. 철회 검사를 생략하지 않는다. Auth emulator는 SDK 자체가 false에서도 계정 상태를 추가 검사한다는 차이가 있다. 에뮬레이터 정지·재개·철회 검사와 auth_time 경계 단위 검사를 통과했다.

`class-metadata-cache.ts`는 /api/classes 및 쿼리 없는 /api/classes/{id}/students만 동일 탭/UID에서30초 메모리로 재사용한다. 진행 중 요청을 합치고 소비자별 AbortSignal을 분리한다. 코드(includeCodes)·답안·자료 URL·프로필·역할 응답을 넣지 않는다. 학급/명단 수정 성공·UID 변경·로그아웃·권한 거부 시 무효화한다. API no-store는 유지한다.

실제 로컬 브라우저에서 Tools→숙제→Tools 이동 시 학급 요청1회·명단1회였다. 권한 확인은 각 페이지에서 수행됐다(dev StrictMode로 /api/me6회 관찰). 이는 요청 수 검증이며 운영 지연 시간 개선 수치는 아니다. 당시 운영 측정과 리전 정보는 위 감사의 근거를 유지하며, 운영 배포 후 같은 조건으로 재측정해야 한다.

운영 반영: 사용자 승인 후 2026-10-16 배포 dpl_5KqYwXkLnfAEienam473v539riJ5에 위 인증·학급 메타데이터 재사용을 포함했다. 운영 도메인 연결을 확인했다. 종전 감사와 동일한 네트워크/계정 조건의 지연 시간 재측정은 아직 하지 않았으므로 새 운영 속도 수치를 단정하지 않는다.
