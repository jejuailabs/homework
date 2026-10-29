import 'server-only';
import { runMeteredAi } from '@/lib/server/ai';
import { ApiError } from '@/lib/server/policy';
import { providerFailure, readBoundedJson } from '@/lib/server/ai-policy';
import { timedTranscript } from './transcript';
export async function transcribeVoice(ownerUid: string, key: string, audio: Uint8Array,scope:{classId?:string;audioSeconds?:number}={}) {
    if (process.env.VOICE_AI_TRANSCRIPTION_ENABLED !== 'true')
        throw new ApiError(403, 'AI 자막이 꺼져 있어요. 녹음은 그대로 들을 수 있어요.', 'VOICE_AI_DISABLED');
    // Only whisper-1 returns sentence timestamps; other models fall back to length-based timing.
    const model = process.env.VOICE_TRANSCRIBE_MODEL?.trim() || 'whisper-1', timed = model === 'whisper-1';
    return runMeteredAi(ownerUid, 'voice-caption', model, key, async observe => {
        const form = new FormData();
        form.set('file', new Blob([Uint8Array.from(audio)], { type: 'audio/wav' }), 'artwork-voice.wav');
        form.set('model', model);
        form.set('response_format', timed ? 'verbose_json' : 'json');
        if (timed)
            form.append('timestamp_granularities[]', 'segment');
        const signal = AbortSignal.timeout(45000);
        let response: Response;
        try {
            response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal, cache: 'no-store' });
        }
        catch {
            throw new ApiError(signal.aborted ? 504 : 503, '음성을 글로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.', 'VOICE_TRANSCRIPTION_FAILED');
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw providerFailure(response.status);
        }
        // verbose_json carries per-segment token arrays, so it needs more room than plain json.
        const body = await readBoundedJson(response, 200000);
        observe(body,{audioSeconds:scope.audioSeconds});
        const transcript = timedTranscript(body, scope.audioSeconds ?? 60);
        if (!transcript)
            throw new ApiError(502, '음성을 알아듣지 못했어요. 녹음은 그대로 들을 수 있어요.', 'VOICE_EMPTY');
        return transcript;
    },scope.classId);
}
