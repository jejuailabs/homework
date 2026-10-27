'use client';
import { pcmWav, wavDuration, VOICE_RATE, VOICE_MAX_SECONDS } from './wav';
export async function normalizeRecording(blob: Blob) {
    if (blob.size > 8 * 1024 * 1024)
        throw new Error('녹음이 너무 커요. 60초 안으로 다시 녹음해 주세요.');
    const buffer = await blob.arrayBuffer(), bytes = new Uint8Array(buffer);
    try {
        wavDuration(bytes);
        return bytes;
    }
    catch { }
    const browser = globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
    }, Audio = browser.AudioContext || browser.webkitAudioContext, Offline = browser.OfflineAudioContext || browser.webkitOfflineAudioContext;
    if (!Audio || !Offline)
        throw new Error('이 브라우저에서는 음성을 변환할 수 없어요. 최신 Safari·Chrome에서 다시 녹음해 주세요.');
    const context = new Audio();
    try {
        const decoded = await context.decodeAudioData(buffer);
        if (!Number.isFinite(decoded.duration) || decoded.duration < .5)
            throw new Error('녹음이 너무 짧아요. 조금 더 길게 다시 녹음해 주세요.');
        if (decoded.duration > VOICE_MAX_SECONDS + .5)
            throw new Error('녹음은 60초 안으로 해 주세요.');
        const length = Math.min(VOICE_RATE * VOICE_MAX_SECONDS, Math.floor(decoded.duration * VOICE_RATE)), offline = new Offline(1, length, VOICE_RATE), source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const rendered = await offline.startRendering();
        return pcmWav(rendered.getChannelData(0));
    }
    finally {
        await context.close();
    }
}
