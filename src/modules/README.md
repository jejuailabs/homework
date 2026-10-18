# Reusable artwork modules

`voice-caption` and `warm-guestbook` are independent features. Neither imports exhibition components, exhibition records, or exhibition permissions. The host supplies a `ModuleTarget`, with ownership, validated viewer capabilities, container/target identifiers, options and a transaction-time access guard.

## Integration points

- `artwork-extensions/exhibition-adapter.ts`: the exhibition host adapter for voice and guestbook. Digital artbooks use their own `digital-artbook/exhibition-source.ts` adapter.
- `artwork-extensions/slot.tsx`: UI registration. Hosts pass an endpoint, options, display title and an optional function for an artwork's public URL.
- `api/artwork-modules/[...segments]/route.ts`: server feature registration and HTTP boundary. It validates origin and public request limits, then dispatches to the independently loaded feature handler.
- `artwork-extensions/settings.tsx`: reusable switches. Defaults are off. Turning a feature off hides its UI and blocks its API without deleting data.
- `artwork-extensions/review-server.ts` and `review.tsx`: bounded container review, loaded only when the teacher asks to review. New hosts can reuse the review contract.

To add these features to another host, implement a host adapter returning `ModuleTarget`, register its target kind in the HTTP boundary, and render `ArtworkExtensions`. Do not add new host ownership checks inside the voice/guestbook services. Each host must recheck permissions in its `assertFresh` transaction guard. Container keys must include the host namespace.

## Disabling or removing

Set `ARTWORK_MODULES_DISABLED=voice`, `guestbook`, or `voice,guestbook` for a service-wide shutdown. Exhibition settings can disable either feature independently. No migration or deletion is needed. Re-enabling restores existing approved stories and reflections. For source removal, remove the corresponding loader in the UI and HTTP registrations; the other module is independent. Shared types contain options for both but have no runtime dependency on either implementation.

## Voice storage and publication

- Private WAV objects: `module-voice/{ownerUid}/{targetKey}/{recordId}.wav`.
- `moduleVoices/{targetKey}` holds active/draft pointers and at most ten retained recording references. Subcollection `recordings` keeps captions, approval status, immutable audio fingerprint and idempotent lifecycle state.
- `moduleVoiceStorage/{ownerUid}` tracks used and reserved bytes. Default voice budget is100MiB per teacher, independent of the exhibition image budget. The UI allows deletion of older recordings. Deletion blocks playback before physically deleting the file, and quota is released only after deletion succeeds.
- Audio is normalized in the browser to mono16kHz PCM WAV. The server validates the complete canonical WAV header and actual byte length; the60second maximum cannot be bypassed with a client-supplied duration or appended compressed audio.
- STT uses `OPENAI_TRANSCRIBE_MODEL`, default `gpt-transcribe`, and the existing server-only OpenAI key and shared teacher/global request quotas. Requests appear as `voice-caption` in existing AI job telemetry. Audio, transcripts and captions are not written into that job log.
- Saving and editing a caption does not publish it. Only the owning teacher approves it. QR audio requires both exhibition sharing and the public-audio switch. Audio responses verify host access on each request, support byte ranges and are not publicly cached. Old audio URLs stop working when sharing/approval is revoked.
- Completed transcription requests replay their saved result. Failures require an explicit retry, with a maximum of three provider attempts for a recording; there is no automatic paid retry.

## Guestbook storage and moderation

- `moduleGuestbooks/{targetKey}/entries`: original records, including pending/hidden reflections.
- `published`: approved copies only. Public pagination cannot accidentally include pending rows. A viewer's own two deterministic entry IDs are loaded separately.
- One sticker and one short reflection per signed actor/visitor session per artwork. Repeated requests are idempotent; changing an allowed sticker updates the existing entry. Hidden encouragement cannot be reposted to bypass teacher moderation.
- Fixed stickers can appear immediately. Student/visitor free text always needs teacher approval. Text is limited to one line120characters, with basic contact/link/control-character rejection; teacher moderation remains the publication boundary.
- Visitor cookies are random, HMAC signed, HttpOnly and SameSite=Lax; they are not verified parent identities. The signing secret can be set with `CREATIVE_VISITOR_SECRET`; otherwise it is derived from the service-account private key. Anonymous participation is rate limited by visitor, teacher and IP scope. It does not promise perfect one-person-one-vote identification.
- Public entries omit actor keys and account identifiers. Existing class reflection letters are retained in a separate collapsible area rather than silently migrating or deleting them. The new modules do not grant XP or points based on encouragement.

## QR labels and operations

The QR label links to a stable artwork page (`/gallery/{shareToken}?artwork={artworkId}`), not an expiring object URL. The host checks artwork approval and exhibition sharing before offering the label. The user can print the label or download the QR image. Disabling a module does not disable ordinary artwork viewing; turning exhibition QR sharing off revokes the artwork page too.

All feature data/files are accessed through server APIs, so these modules require no new Firebase client write rules or composite indexes. Do not directly deploy to Vercel: commit/push validated changes and verify GitHub-triggered automatic deployment.

STT implementation reference: [OpenAI file transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text) and [transcription API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create), checked2026-10-17.

## 디지털 아트북

`digital-artbook/`은 학생별 PDF 포트폴리오 모듈이다. 전시실별 `artbook.enabled`와 `ARTWORK_MODULES_DISABLED=artbook`으로 중지할 수 있다. 자세한 연결·분리 지점, 비공개 보관, 실행 방식과 한도는 루트 `GALLERY_ARTBOOK_IMPLEMENTATION.md`를 따른다.

## 나의 작은 세상

`my-space/`은 기존 보말 지갑을 쓰는 학생 개인 공간 모듈이다. 동물 성장·옷·방·개인 다꾸와 카탈로그를 분리한다. `MY_SPACE_DISABLED=true`로 중지하며 보관 자료와 구매 내역을 유지한다. 연결 지점, 사진 예산, 성격·에셋과 검증은 `MY_SPACE_IMPLEMENTATION.md`를 따른다.
