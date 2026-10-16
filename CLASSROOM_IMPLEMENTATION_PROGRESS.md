# 수업 기능 구현·검증 — 2026-10-16

이 문서의 기능은 사용자 승인 후 운영 앱·규칙·인덱스에 반영했다. 최종 배포와 검증은 마지막 절에 기록한다. Firebase를 유지하며 Supabase 이전은 하지 않는다. 기존 미커밋 작업을 보존했다.

## 구현

- 숙제: 교사가 참고 이미지·영상 10개까지 추가하고 수정·제거. 답안 형식과 독립. 이미지25MB/영상250MB, 교사5GB. Firebase Storage SDK 직접 전송 뒤 서버에서 실제 형식·소유권·크기 확인. 학생은 배정된 숙제에서 자료를 보고 영상을 재생. 참여보드가 참조하는 자료는 숙제에서 빼도 보존.
- 전시 QR: 준비 중 전시에 사용할 수 없는 QR을 제공하지 않음. ‘학부모에게 공개하고 QR 만들기’에서 전시 공개와 QR 생성을 연결. 학부모 미리보기·비로그인 관람. 공유 해제·미공개는 차단.
- 전시 화면: 가로·세로·정사각 비율에 맞춘 얇은 액자와 흰 매트. 사진·캡션이 프레임에 가리지 않도록 깊이 분리. 25점 삼면 배치, 중앙 슬라이드·모아보기 유지. 가변 속도·대각선·손떼기 정지를 지원하는 모바일 아날로그 조이스틱.
- Tools: 36개 도구. 같은 도구도 여러 개 실행. 이동·크기 변경·최소화·최대화·별도 팝업. 공통 교사 layout에서 유지되어 숙제 메뉴로 이동해도 타이머 지속. 모바일은 활성 창을 전환하며 다른 도구 상태 유지.
- 판서: 텍스트·이미지·펜·객체 이동/크기·위치 잠금·앞뒤 순서·겹친 객체 선택. 내 실행 취소/다시 실행, 확대/화면 이동, 기기 자동 저장, 기존 펜 데이터 이전. PNG/인쇄PDF/이동 가능한 편집JSON 저장·불러오기.
- 숙제 → 참여보드: 안내와 선택한 제출 버전을 새/기존 내부 보드에 게시. 출처 표시, 이름 숨김, 같은 버전 중복 방지. 외부 Padlet 연동은 하지 않음.
- 투표: 직접 입력 또는 숙제/참여보드에서 2~50개 후보 선택. 이름·파일명 숨김, 마감 시각·결과 공개 시점, 학생 QR, 1인1표/마감 전 변경. 교사 마감/재개. 숨긴 원본은 후보 공개·투표도 차단.
- 함께캔버스: 학급/선택 모둠별 공동 텍스트·그림·사진. Yjs13.6.33 CRDT로 동시 편집 병합, 한글 조합 보존, 참여자·커서, 개인 실행 취소, 오프라인 변경 보관·재접속 병합. 교사 학생편집 잠금, 자동/이름 붙인 스냅샷, 수정 로그, 과거 버전 미리보기/복원과 복원 전 자동 백업. 복원 전 세대의 늦은 전송 차단. 오래된 버전/로그도 페이지를 넘겨 조회.
- 성능: 정상 운영 인증 요청의 중복 Auth UserRecord 조회를 한 번으로 합침. 서명·만료·철회·정지·Google 공급자·학생 코드 버전·명단 검사를 유지. 같은 탭/동일 로그인 사용자에서 학급 목록·코드 없는 명단만30초 메모리 재사용, 진행 중 요청 합치기. 변경 성공·계정 변경·로그아웃·인증 거부 시 무효화. 학생 코드·답안·서명 미디어·권한은 캐시하지 않음. 개인 API no-store 유지.
- 바로가기: Android/iOS/PC 안내, 내부 브라우저 감지, 설치 이벤트가 없는 경우 수동 메뉴 안내. 실제 Android 단말에 앱 설치를 실행한 것은 아님.

## 검증 근거

로컬 demo-homework Auth9099 / Firestore8080 / Storage9199, Next3003. 브라우저 외부 통신을 차단하고 가상 계정·자료 사용. 개인 세션/서명키가 든 fixture는 출력·공유 금지.

| 검사 | 결과 / 비공개 근거 |
|---|---|
| 단위 테스트 |175/175 통과, `.qa/classroom-next-unit.log`|
| 타입·배포 빌드 |통과. Next16.4 컴파일·TypeScript·정적21페이지 생성 완료, `.qa/classroom-next-build.log`|
| 숙제 자료 API/UI |8+4 그룹 통과, `.qa/classroom-next-media-api-results.json`, `classroom-next-ui-results.json`|
| 동시 도구 창 |3 그룹 통과, `classroom-next-window-results.json`|
| 학습 연동 API |7 그룹 통과, `classroom-next-links-api-results.json`|
| 함께캔버스 API |7 그룹 통과, `classroom-next-canvas-api-results.json`|
| 함께캔버스 실제 브라우저 |교사+학생2명, 한글 동시 수정·IME·이미지·PNG·잠금·복원·오프라인 병합7 그룹 통과, `classroom-next-canvas-ui-results.json`|
| 이력 페이지 |버전62개/로그151개 누락·중복0, 변경된 모둠 생성 재요청409, `classroom-next-canvas-history-results.json`|
| 로컬 판서·게시·투표 UI |모바일·텍스트/사진/펜·자동저장/JSON/PNG·숙제 게시·수동/숙제/보드 투표4 그룹 통과, `classroom-next-integration-results.json`|
| 인증 유지 |Auth 정지/재개·철회 후 접근 거부, `classroom-next-auth-results.json`|
| 메모리 캐시 |사용자 분리·30초만료·코드/답안 제외·무효화·소비자 개별 취소4 그룹 통과, `classroom-next-cache-results.json`|
| 메뉴 요청 수 |Tools→숙제→Tools에서 학급/명단 각각1회. 권한 서버검사 유지, `classroom-next-cache-ui-results.json`|
| 전시 화면 |합성25점 실제 WebGL·중앙모아보기·모바일 조이스틱/정지 검사, `classroom-next-gallery-results.json`. 최종 캡션 수정 후 화면 확인 포함|

30개 Node Firestore SDK 클라이언트를 실제 에뮬레이터 구독과 동시 API 수정에 연결했을 때30개 기여가 전원 동일 내용으로 병합되고 오류0이었다. 단, 같은 PC의 Next dev+에뮬레이터 부하 환경에서 전원 전파에26067ms가 걸렸다(중앙 API25992ms, 최대26030ms). **30대 실제 모바일 또는 운영 성능 검증을 뜻하지 않으며 이 수치를 ‘원활한30명 실시간 성능’으로 홍보하지 않는다.** 근거 `.qa/classroom-next-canvas-load-results.json`. 실제3브라우저 기능 검사는 별도로 통과했다.

Storage emulator가 downloadTokens를 기존 값과 union하는 구현 제약 때문에 신규 참고자료의 실제 운영 토큰 폐기까지 검증한 것은 아니다. 서버 응답에 토큰URL이 없고 private/no-store인 것은 확인했다. 기존 전시의 운영 GCS 토큰 폐기는 앞선 검증에서 확인했다.

## 운영 반영 시 변경

- 앱(숙제/전시/Tools/보드/투표/함께캔버스/인증·캐시).
- `storage.rules`: 교사의 자기 참고자료 예약 경로 create-only 허용. 함께캔버스 사진은 서버만 저장.
- `firestore.rules`: 함께캔버스 현재 세대/접속자 읽기만 제한 허용. 같은 학급·선택 모둠·정지 상태·학생 인증버전·60초 reader grant 확인. 모든 직접 클라이언트 쓰기는 차단하고 API만 쓰기 수행.
- `firestore.indexes.json`: 참고자료 소유자+만료, 캔버스 공개 이력+시각 인덱스와 큰 CRDT 필드 인덱싱 제외. 인덱스 준비 후 운영 흐름 확인.
- 데이터 일괄 이전·기존 학생 코드 재발급·기존 전시 일괄 공개는 없음.

## QA 환경

Next wrapper PID는 `.qa/classroom-next-server-pid.txt`(현재5800), 시작 `.qa/classroom-next-start.ps1`, 로그 `classroom-next-server-restart*.log`. 에뮬레이터 wrapper33708, 시작 `.qa/exhibition-emulators-start.ps1`. 종료 시 해당 PID의 CommandLine을 확인하고 자기 QA 트리만 종료한다. Node24 절대경로를 사용한다. `.qa`의 비공개 fixture를 커밋하지 않는다.


## 사용자 관리 개편 및 운영 반영 — 2026-10-16

사용자 관리에서 교사와 학생을 섞어 users200개만 가져오던 방식을 제거했다. 교사 탭은20명/페이지, 학생 탭은 선택한 교사의 학생50명/페이지다. 교사별 전체/학급별 학생을 조회하며 이름·이메일(교사), 이름·출석번호(학생)의 정규화된 앞부분 검색과 전체 건수, 이전/다음 커서를 서버에서 처리한다. 교사를 바꾸면 이전 학급/학생 필터를 비운다. 계정 정지·복구 후 같은 선택을 유지하고 보호된 운영자 계정은 서버 정책을 따른다. 전용 DTO만 반환해 학생 코드·인증 버전·검색 토큰·암호화 필드를 노출하지 않는다.

검색 색인은 users.directoryRole/directoryTeacherUid/directoryNumber/directorySearch의 추가 메타데이터다. 교사 로그인 및 학생 생성 시 계속 기록한다. scripts/migrate-admin-directory.mjs는 기본 읽기 전용이고 --apply일 때만 이전 메타데이터를 비공개 .qa JSONL에 백업하고 updateTime 조건으로 해당 필드만 추가한다. 기존 로그인·이름·권한·학생 코드·학생 소속 원본은 변경하지 않는다. 운영25프로필(교사3/학생22)의 연결을 검증하고 적용했다. 연결 누락0. 운영에서는 가상 교사/학생을 생성하지 않았다.

에뮬레이터에서 가상 교사25명·학생265명으로 교사20페이지, 한 교사의261학생50페이지, 기존200개를 넘는 검색, 중복/누락0, 다른 교사 차단, 클래스 필터/커서 경계/권한/비밀값 제외를 확인했다. 실제 브라우저에서 교사/학생 탭, 교사 선택, 학생 다음 페이지, 검색/학급 선택, 정지/복구, 교사 전환,390px 모바일을 검증했다. 근거 .qa/admin-directory-api-results.json, admin-directory-ui-results.json. 타입 검사·기존175단위 테스트·운영 빌드 통과.

사용자의 ‘운영 앱·규칙·인덱스에 배포’ 승인 후 기존 수업 확장과 이번 사용자 관리 수정을 함께 배포했다. Firebase book-9b8ce Firestore/Storage 규칙 및 인덱스 배포 성공. Vercel dpl_5KqYwXkLnfAEienam473v539riJ5, https://homework-ogyzjktwf-jejuai.vercel.app 의 Ready 및 homework-indol-gamma.vercel.app 연결 확인. 서울icn1. 운영 검색/교사별/학급별 쿼리15개 통과. 정식주소 페이지4개200, 비로그인API4개401·no-store, 배포된 UI의 합성응답 브라우저/모바일 확인 통과. 운영 UI 검사는 합성 응답을 사용했고 실제 로그인 관리자 세션으로 사용자 화면을 조작한 검증은 아니다. 근거 .qa/classroom-admin-production-inspect.log, classroom-release-rules.log, admin-directory-production-index-results.json, classroom-admin-production-results.json. 생산 읽기 검증 중 데이터 쓰기0. 별도로 승인된 검색 메타데이터 추가25회와 규칙/인덱스 배포는 위대로 수행했다.


## 모바일 전시실 전체 화면·프레임 교체 — 2026-10-16

모바일 전시실은 고정 헤더/관리 버튼 영역을 별도로 차지하지 않고 브라우저에서 실제 보이는 전체 영역을 3D 화면이 채웁니다. 교사·학생 방문 dialog와 학부모 QR 관람 모두 적용했습니다. VisualViewport resize/scroll에 맞춰 화면 높이를 다시 계산하고 확대 조작은 막지 않습니다. 제목·관리 메뉴·닫기는 작은 겹침 헤더에 두고, 업로드/설정/QR은 메뉴를 열었을 때만 표시합니다. 재생 패널은 기본44px 작품 버튼으로 접고 필요할 때 펼칩니다. 조이스틱88px, 초기위치44px과 목록 아이콘을 화면 모서리에 배치하며 숨긴 문구의 접근성 이름은 유지합니다.

중앙 스크린의 생성 장식 프레임을 실제 표시 코드에서 제거했습니다. 일반 벽면과 같은 얇은 중립색 테두리·흰 매트를 사용하고 작품의 실제 이미지 비율에 따라 중앙 프레임 너비/높이도 바꿉니다. 이미지 텍스처와 캡션을 새 치수로 다시 그려 가로·세로·정사각 사진을 늘리지 않습니다. 모아보기는 고정 배열을 유지합니다. 구 생성 PNG는 이전 캐시 호환을 위해 파일만 남아 있으며 새 전시실은 요청하지 않습니다.

단위176개, 타입 검사와 운영 빌드 통과. Chrome/WebKit 각각 교사·학생·학부모 관람,390×720/610 높이 변경,320×568/430×932/844×390,25점 모아보기·확대·다시닫기·조이스틱·가로/세로 프레임과 데스크톱을 검증했습니다. 실제 아이폰 하드웨어 설치/조작을 뜻하지 않습니다. 근거 .qa/mobile-gallery-chromium-results.json, mobile-gallery-webkit-results.json, mobile-gallery-unit.log.

운영 배포 dpl_9Pq44X5BMZwBUi9ACie5d5ka21FP (homework-fbkrcp2ng-jejuai.vercel.app)의 Ready와 homework-indol-gamma.vercel.app 연결을 확인했습니다. 배포한 WebKit 화면에서 교사/학부모 전체 영역, 접힌 조작부,25점 모아보기와 높이 변경을 다시 확인했습니다. 화면 검사는 합성 API 응답/가상 사진을 사용했고 운영 개인 자료를 수정하지 않았습니다. 실제 비로그인 API401/no-store도 확인했습니다. 근거 .qa/mobile-gallery-production-results.json, mobile-gallery-production-inspect.log. 앱 변경만 배포했으며 이번에 데이터 이전이나 권한 규칙 변경은 하지 않았습니다.

## 모바일 전시학교 첫 화면·전체 진입 동선 보완 — 2026-10-16

직전 수정은 전시실 내부 dialog/QR 장면에만 전체 화면을 적용했고, 전시학교 입구와 교실은 일반 페이지 카드 안에 남아 있었습니다. 이번에는 입구·교실도 같은 VisualViewport 기반의 고정 화면으로 전환했습니다. 모바일 페이지 제목/설명/관리 버튼은 화면을 밀어내지 않고 작은 헤더와 펼침 메뉴로 제공하고, 메뉴에서 관리 화면으로 돌아갈 수 있습니다. 입구의 나가기와 교실의 학교 앞으로 이동을 구분했습니다.

모바일 학교마당은 한 번에 건물 한 채를 표시하고 좌우 마당 이동 및 전체 반 목록을 유지합니다. 세로 화면의 가로 화각에 맞춰 추적 카메라 거리를 늘려 건물 양옆과 지붕이 잘리지 않게 했습니다. 시계탑의 아래 부분을 높여 이름판과 공간적으로 분리했습니다. 반 이름을 읽을 수 있는 입장 버튼을 추가했고, 교실에서도 전시실 입장/선택 버튼을 제공합니다. 작품 포스터가 한두 개이면 해당 행 가운데에 배치합니다. 가로 화면의 입장 버튼 최대 폭을 제한해 캐릭터를 덮지 않게 했습니다. 데스크톱은 기존 페이지형 탐색을 유지합니다.

단위176개 및 타입 검사 통과. Chromium/WebKit에서 교사·학생별 입구→교실→전시실→교실→입구 왕복, 전체 화면 크기, 관리 메뉴, 이름판과 시계탑의 투영 분리, 건물 전체의 화면 내 배치,390×720→610 높이 변경을 확인했습니다.320×568/430×932/844×390에서4개 반의 마당 넘기기와 전체 반 목록, 데스크톱 회귀 검사도 통과했습니다. 근거 .qa/mobile-entry-chromium-results.json, mobile-entry-webkit-results.json, mobile-entry-unit.log. 브라우저 검사는 합성 API 응답과 가상 작품을 사용하며 실제 아이폰 하드웨어 검증을 뜻하지 않습니다.

운영 배포 dpl_5Hnd8tG6Jikm8eWZX5KRTAeNpfpq (homework-m6o1rhkjs-jejuai.vercel.app) Ready 및 정식 homework-indol-gamma.vercel.app 연결 확인. 배포된 정식 주소의 WebKit 검사에서도 위6그룹 전체 통과, 교사/학생 페이지200 및 비로그인 전시API401/no-store 확인. 합성 응답으로 화면을 검증했으며 운영 데이터 쓰기0. 근거 .qa/mobile-entry-production-webkit-results.json, mobile-entry-production-inspect.log. 앱 UI만 배포했고 Firebase 규칙/인덱스는 변경하지 않았습니다.
