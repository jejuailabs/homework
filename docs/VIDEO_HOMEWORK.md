# 영상 숙제 구현과 운영 연결 승인 범위

## 구현 기준

영상 숙제는 영상 한 개·최대 180초·전송 원본 250MiB 이하로 제한한다. 사진 숙제의 10개 첨부와 기존 자유 제출 이력은 유지한다. 서버에서도 실제 파일의 크기·영상 길이·형식을 검사한다.

브라우저는 실제 업로드 바이트 기준 진행률과 화면 유지 안내를 표시한다. 전송은 전체 시간 제한 대신 60초 동안 진행이 없을 때만 중단으로 보고, 같은 전송 위치에서 최대 두 번 이어 보낸다. 느린 휴대폰 망에서 3분 영상이 몇 분 걸려도 끊기지 않게 하기 위함이다. 업로드 이후에는 Firestore에 저장된 서버 작업 상태를 표시하며, 임의의 압축 퍼센트는 표시하지 않는다. 처리 단계·경과 시간·화면을 이동해도 된다는 안내를 표시한다. 전송 실패, 처리 지연, 재시도 가능한 압축 실패, 새 파일이 필요한 영구 실패를 구분한다.

압축은 FFmpeg로 MP4/H.264/AAC를 만든다. 가로는 최대 1280×720, 세로는 최대 720×1280이며 회전 정보와 종횡비를 보존한다. 최대 30fps, 낮은 원본 프레임은 유지한다. 영상 목표 1.0Mbps·최대 1.1Mbps(열람·보관 용량 절감), 음성 64kbps, yuv420p, faststart를 적용하고 위치 등의 원본 메타데이터는 제거한다.

인코딩 결과의 코덱·크기·길이·프레임을 검사하고 전체 디코딩으로 재생 오류를 검사한다. 압축본과 JPEG 썸네일을 저장한 뒤 저장된 압축본을 다시 내려받아 SHA-256이 일치하는지 검증한다. 검증 후 제출을 확정하고 원본을 세대 번호 조건부 삭제한다. 원본 삭제가 실패하면 정상 제출과 압축본은 보존하고 삭제만 재시도한다.

## 상태와 저장 경로

- `videoJobs/{uploadId}`: queued → processing(download/inspect/encode/verify/save/submit) → complete 또는 failed. 처리 임대와 재시도 버전으로 중복·오래된 작업을 차단한다.
- `videoJobs/{uploadId}.stageTimings`·`processingMs`: 시도별 단계 소요 시간(ms). 시범운영 원가 산정용이며 처리 동작에는 쓰지 않는다.
- `usageDaily/{날짜}_{class|teacher}_{id}`: 영상 재생·이미지 열람(파일당 화면 세션 1회), 업로드 전 거절, 사진 축소 결과·바이트·소요 시간의 일별 합계. 브라우저가 모아 두었다가 화면을 떠날 때나 1분마다 한 번에 보낸다.
- `videoSubmissionSlots/{assignmentId}_{studentId}`: 현재 작업. 재입장 시 이 작업을 복원한다.
- `uploads/{uid}/{uploadId}/file`: 임시 원본. 재시도 가능한 처리 실패는 원본을 최대 7일 보관한다. 길이·형식 등의 영구 실패는 원본과 임시 결과물을 정리한다.
- `processed-videos/{uid}/{uploadId}/video.mp4`, `thumbnail.jpg`: 검증된 제출 파일. 성공한 과거 재제출 이력은 유지한다.
- Cloud Tasks 자동 재시도와 학생의 재처리 버튼은 원본 재업로드 없이 동작한다. 일일 정리 작업은 큐 장애·만료 임대·원본 삭제 실패를 복구하고 보관 기한을 넘긴 실패 원본을 정리한다.

## 운영 리소스와 권한: 별도 승인 후 생성

대상은 기존 프로젝트 `book-9b8ce`, 서울 `asia-northeast3`다. 새 비밀키 파일은 만들지 않는다. 기존 서비스 계정·사용자의 현재 권한을 제거하거나 넓은 관리자 역할을 추가하지 않는다.

| 생성/연결 대상 | 이름과 범위 |
| --- | --- |
| 비공개 Cloud Run | `homework-video-worker`. 2 vCPU·2GiB, 요청 동시 처리 1, 최소 인스턴스 0·최대 3, 요청 제한 1200초. 공개 호출 권한 없음 |
| 작업 큐 | `homework-video`. 동시 작업 최대 3, 초당 최대 1회 시작, 자동 재시도 최대 5회·최대 2시간 |
| 컨테이너 저장소 | Artifact Registry `homework-workers` |
| 빌드 소스 버킷 | `book-9b8ce-video-build-source`. 비공개·동일 지역·균일 버킷 접근 제어. 영상이 아니라 작업기 소스 빌드용 |
| 작업기 서비스 계정 | `homework-video-worker@book-9b8ce.iam.gserviceaccount.com`: 프로젝트 `roles/datastore.user`(Firestore 읽기/쓰기). 버킷 `book-9b8ce.firebasestorage.app`의 `uploads/`·`processed-videos/` 객체만 IAM 조건으로 `roles/storage.objectUser` |
| 큐 호출 서비스 계정 | `homework-video-tasks@book-9b8ce.iam.gserviceaccount.com`: 위 Cloud Run 서비스에만 `roles/run.invoker` |
| 빌드 서비스 계정 | `homework-video-build@book-9b8ce.iam.gserviceaccount.com`: 위 컨테이너 저장소에만 `roles/artifactregistry.writer`, 위 소스 버킷에만 `roles/storage.objectViewer`, 프로젝트에 빌드 로그 기록용 `roles/logging.logWriter` |
| 기존 웹 서버 계정 추가 권한 | `firebase-adminsdk-fbsvc@book-9b8ce.iam.gserviceaccount.com`: 위 큐에만 `roles/cloudtasks.enqueuer`, 위 큐 호출 계정에만 `roles/iam.serviceAccountUser` |

Firestore 서버 IAM은 컬렉션 단위 제한이 아닌 프로젝트 권한이다. 작업기는 요청에서 전달받은 경로를 신뢰하지 않고 작업 레코드의 소유자·정해진 경로와 학생·과제·제출 상태를 검사한다. 학생이 다른 학생의 작업을 조회하거나 재시도할 수 없도록 웹 API에서 로그인과 소유권을 검사한다.

Cloud Run·Cloud Tasks·빌드·저장소에는 무료 할당량이 있지만 이를 넘으면 기존 Google Cloud 결제 계정에 종량 과금된다. 최소 인스턴스 0은 유휴 상시 실행을 방지하고 최대 3은 동시 실행 수를 제한한다. 월간 요금의 자동 상한을 의미하지 않는다. 운영 비용은 실제 입력 형식과 처리 시간으로 확인해야 한다.

공식 근거: [비공개 Cloud Run과 Cloud Tasks](https://docs.cloud.google.com/run/docs/triggering/using-tasks), [큐별 IAM 제한](https://docs.cloud.google.com/tasks/docs/secure-queue-configuration), [Cloud Run 요금](https://cloud.google.com/run/pricing), [Cloud Tasks 요금](https://cloud.google.com/tasks/pricing), [컨테이너 저장소 요금](https://cloud.google.com/artifact-registry/pricing).

## 검증 결과

- 자동 테스트 226개. 영상 수·길이·용량, 회전·종횡비·저프레임, 인코딩 옵션, 결과 검증 포함.
- 실제 3분 영상: 압축본 33,145,895바이트(약 33.1MB/31.6MiB), 1280×720·30fps·H.264/AAC. 세로 720×1280·24fps·무음, 실제 90도 회전 MOV, 길이 정보가 없는 WebM도 검증.
- Firebase 에뮬레이터에서 상태 복원, 다른 사용자 접근 차단, 처리 중 원본 보호, 압축본 검증 후 원본 삭제·자동 제출, 저장 실패 후 원본 재사용 재시도, 원본 삭제만 재시도, 중복 제출 방지, 서버의 3분 초과 차단 검증.
- 브라우저에서 길이 초과 선택 차단, 전송 안내, 처리 대기·완료, 썸네일이 있는 압축 MP4의 실제 재생 확인.

## 승인 후 연결 순서

1. 위 리소스·권한과 사용량 과금을 승인받은 뒤 `scripts/setup-video-infra.ps1` 실행.
2. `scripts/deploy-video-worker.ps1`로 검증한 작업기 컨테이너를 빌드하고 비공개 서비스 배포. 큐 호출 계정에만 호출 권한 부여.
3. 비공개 호출 차단, 큐 실행·자동 재시도와 시험 영상의 압축·원본 삭제를 운영 프로젝트에서 검증.
4. 접근 차단된 Firestore `runtimeConfig/videoProcessing`에 enabled/projectId/location/queue/workerUrl/invokerServiceAccount 연결 설정. 비밀 토큰을 이 문서나 저장소에 기록하지 않음.
5. 기능 브랜치를 main에 반영하고 GitHub 연동 Vercel 자동 운영 배포 확인. 웹앱의 CLI·API·대시보드 직접 배포는 하지 않음.
