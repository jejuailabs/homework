export const VOICE_MAX_SECONDS = 60, VOICE_RATE = 16000, VOICE_MAX_BYTES = 44 + VOICE_RATE * 2 * VOICE_MAX_SECONDS;
/** Canonical PCM prevents lying about compressed recording duration or appending hidden audio. */
export function wavDuration(bytes: Uint8Array): number {
    if (bytes.length < 44 || bytes.length > VOICE_MAX_BYTES)
        throw new Error('AUDIO_SIZE');
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), label = (i: number, n: number) => String.fromCharCode(...bytes.subarray(i, i + n));
    if (label(0, 4) !== 'RIFF' || label(8, 4) !== 'WAVE' || label(12, 4) !== 'fmt ' || label(36, 4) !== 'data' || v.getUint32(4, true) !== bytes.length - 8 || v.getUint32(16, true) !== 16 || v.getUint16(20, true) !== 1 || v.getUint16(22, true) !== 1 || v.getUint32(24, true) !== VOICE_RATE || v.getUint32(28, true) !== VOICE_RATE * 2 || v.getUint16(32, true) !== 2 || v.getUint16(34, true) !== 16 || v.getUint32(40, true) !== bytes.length - 44 || (bytes.length - 44) % 2)
        throw new Error('AUDIO_FORMAT');
    const seconds = (bytes.length - 44) / (VOICE_RATE * 2);
    if (seconds < .5 || seconds > VOICE_MAX_SECONDS)
        throw new Error('AUDIO_DURATION');
    return seconds;
}
export function pcmWav(samples: Float32Array): Uint8Array {
    const bytes = new Uint8Array(44 + samples.length * 2), v = new DataView(bytes.buffer), label = (i: number, s: string) => [...s].forEach((c, j) => v.setUint8(i + j, c.charCodeAt(0)));
    label(0, 'RIFF');
    v.setUint32(4, bytes.length - 8, true);
    label(8, 'WAVE');
    label(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, VOICE_RATE, true);
    v.setUint32(28, VOICE_RATE * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    label(36, 'data');
    v.setUint32(40, samples.length * 2, true);
    samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767)), true));
    return bytes;
}
