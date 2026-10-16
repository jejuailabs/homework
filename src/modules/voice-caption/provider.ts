import 'server-only';
import { runMeteredAi } from '@/lib/server/ai';
import { ApiError } from '@/lib/server/policy';
import { providerFailure, readBoundedJson } from '@/lib/server/ai-policy';
export async function transcribeVoice(ownerUid: string, key: string, audio: Uint8Array) {
    const model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-transcribe';
    return runMeteredAi(ownerUid, 'voice-caption', model, key, async () => {
        const form = new FormData();
        form.set('file', new Blob([Uint8Array.from(audio)], { type: 'audio/wav' }), 'artwork-voice.wav');
        form.set('model', model);
        form.set('response_format', 'json');
        const signal = AbortSignal.timeout(45000);
        let response: Response;
        try {
            response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal, cache: 'no-store' });
        }
        catch {
            throw new ApiError(signal.aborted ? 504 : 503, '음성을 변환하지 못했어요. 잠시 후 다시 시도해 주세요.', 'VOICE_TRANSCRIPTION_FAILED');
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw providerFailure(response.status);
        }
        const body = await readBoundedJson(response, 20000) as {
            text?: unknown;
        };
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 3000)
            throw new ApiError(502, '음성을 알아듣지 못했어요. 캡션을 직접 입력하거나 다시 녹음해 주세요.', 'VOICE_EMPTY');
        return body.text.trim();
    });
}
