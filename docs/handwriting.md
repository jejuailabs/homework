# 사진 글 정리

- Teacher Tools: `/teacher/tools/handwriting`, under 판서·자료. Search terms include 받아쓰기, 맞춤법, 띄어쓰기, 손글씨, 일기, 공책 and OCR.
- `POST /api/ai/handwriting` requires the existing teacher session and same-origin protection.
- The client accepts one photo up to 20MB, normalizes orientation, limits its longest edge to 2048px and encodes JPEG. The server decodes, checks and re-encodes the image before sending it to the provider. Embedded JPEG input is limited to 1.8M characters; external image URLs are rejected.
- The fixed provider is OpenAI Responses API, `gpt-6-luna`, `reasoning.effort=none`, `store=false`, strict JSON output and at most 10,000 output tokens. No retries, tools or model fallback are enabled. One manual processing action makes one provider call and shares the existing per-teacher/global AI attempt quotas.
- The response contains a faithful original, a minimally corrected version and uncertainty notes. Unreadable portions use `⟦확인 필요⟧` in both versions. More than 3000 characters requires splitting the photo; the result is never silently truncated.
- Pictures, transcriptions and corrections are not written to Firebase or application storage. Existing AI quota/job records contain identifiers and processing status only. The provider's own data retention conditions apply independently of `store=false`.
- Results are editable in memory. Changes are compared locally, and copy/download uses the current reviewed text. The comparison download also includes the original and uncertainty notes. Photo enlargement and rotation run locally and make no AI requests.

## Activation and billing

`HANDWRITING_AI_ENABLED=true` enables paid processing. Missing/false keeps it disabled. It uses the existing server-only `OPENAI_API_KEY` and does not change other tools' model settings or quotas.

Before enabling production or running a real-provider test, obtain the owner's informed approval for OpenAI usage charges and any additional existing Firebase usage. Request count limits are not monetary budgets. This feature introduces no new subscription, automatic paid fallback or plan upgrade.

Official references checked 2026-10-24:

- [OpenAI model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna): standard input $0.10 / 1M tokens; output $0.50 / 1M tokens. Image input contributes to metered input; actual cost varies with image and text length. This model has no supported free API tier.
- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Firestore billing](https://firebase.google.com/docs/firestore/pricing): the existing quota/job records add reads and writes. The project's remaining free quota, region-specific unit prices and actual overages must be checked by the billing owner.

Use GitHub main pushes for automatic Vercel production deployment, including after activating the environment setting. Do not deploy or redeploy directly.
