# 사진 글 정리

- Teacher Tools: `/teacher/tools/handwriting`, under 판서·자료. Search terms include 받아쓰기, 맞춤법, 띄어쓰기, 손글씨, 일기, 공책 and OCR.
- `POST /api/ai/handwriting` requires the existing teacher session and same-origin protection.
- The client accepts one photo up to 20MB, normalizes orientation and limits its longest edge to 2048px without enlarging small inputs. Both client and server prefer lossless PNG within the existing 1.8M-character image limit, using bounded JPEG only when lossless output exceeds it. The server fully decodes and checks JPEG/PNG pixels, validates the claimed content type, limits input pixels, flattens transparency and removes metadata before provider use. External image URLs are rejected.
- The selected image's pixel dimensions are visible. A short edge below 600px or long edge below 1000px triggers an advisory for full-page photos; it does not block a readable small crop or predict accuracy. The UI recommends a source long edge of 1600px for a full page as practical guidance, not an accuracy guarantee. Resolution alone cannot detect blur, angle, handwriting ambiguity or model transcription errors.
- The fixed provider is OpenAI Responses API, `gpt-6-luna`, `service_tier=default` (standard processing), `reasoning.effort=none`, `store=false`, strict JSON output and at most 10,000 output tokens. No retries, tools or model fallback are enabled. One manual processing action makes one provider call and shares the existing per-teacher/global AI attempt quotas.
- The response requests a faithful original, a minimally corrected version and uncertainty notes. Unreadable portions use `⟦확인 필요⟧` in both versions. More than 3000 characters requires splitting the photo; the result is never silently truncated.
- Known limitation verified with two real-provider calls on 2026-10-24: the corrected text fixed the sample's spelling and spacing, but the model also normalized misspellings in the original field despite explicit preservation instructions. The UI states this limitation and allows both fields to be checked against the enlarged photo and edited. This feature is for preparing corrected text, not grading dictation or reliably counting the pupil's original spelling mistakes. No additional live calls were made after the two-call approval was exhausted. Token-based total estimate: $0.0006046, excluding other services and taxes.
- Pictures, transcriptions and corrections are not written to Firebase or application storage. Existing AI quota/job records contain identifiers, status and numeric usage metadata (see `ai-usage.md`). The provider's own data retention conditions apply independently of `store=false`.
- Results are editable in memory. Changes are compared locally, and copy/download uses the current reviewed text. The comparison download also includes the original and uncertainty notes. Photo enlargement and rotation run locally and make no AI requests.
- The prompt requests every legible line and uncertainty markers for unclear spans. An `unreadable` response may preserve both partial versions; these are shown with an explicit incomplete-reading warning and remain editable. One-sided partial versions, mismatched uncertainty-marker counts and unsupported statuses remain rejected. Empty unreadable results explain resolution, focus and angle rather than claiming that lighting alone caused the failure.
- The floating tool uses a document-sized window instead of the generic small modal. Photo and text panels share the space on wide windows; narrow windows switch panels with tabs. Read/correct and copy/download actions remain outside the scrolling result content. See `tool-windows.md`.

## Activation and billing

`HANDWRITING_AI_ENABLED=true` enables paid processing. Missing/false keeps it disabled. It uses the existing server-only `OPENAI_API_KEY` and does not change other tools' model settings or quotas.

Before enabling production or running a real-provider test, obtain the owner's informed approval for OpenAI usage charges and any additional existing Firebase usage. Request count limits are not monetary budgets. This feature introduces no new subscription, automatic paid fallback or plan upgrade.

Official references checked 2026-10-24:

- [OpenAI model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna): standard input $0.10 / 1M tokens; output $0.50 / 1M tokens. Image input contributes to metered input; actual cost varies with image and text length. This model has no supported free API tier.
- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Firestore billing](https://firebase.google.com/docs/firestore/pricing): the existing quota/job records add reads and writes. The project's remaining free quota, region-specific unit prices and actual overages must be checked by the billing owner.

Use GitHub main pushes for automatic Vercel production deployment, including after activating the environment setting. Do not deploy or redeploy directly.
