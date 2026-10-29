export type TranscriptSegment = { start: number; end: number; text: string };
export type VoiceTranscript = { text: string; segments: TranscriptSegment[] };
export const TRANSCRIPT_MAX_CHARS = 3000, TRANSCRIPT_MAX_SEGMENTS = 120;
const round = (value: number) => Math.round(value * 100) / 100;
const clean = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
/** Sentence timings proportional to length, for providers that return text without timestamps. */
function spread(text: string, duration: number): TranscriptSegment[] {
    const parts = text.split(/(?<=[.!?。…])\s+/).map(part => part.trim()).filter(Boolean).slice(0, TRANSCRIPT_MAX_SEGMENTS);
    const total = parts.reduce((sum, part) => sum + part.length, 0) || 1;
    let at = 0;
    return parts.map(part => { const start = at; at += duration * part.length / total; return { start: round(start), end: round(at), text: part }; });
}
/** Normalizes an untrusted provider body (verbose_json segments or plain text) into bounded, ordered segments. */
export function timedTranscript(body: unknown, duration: number): VoiceTranscript | null {
    const value = body && typeof body === 'object' ? body as { text?: unknown; segments?: unknown } : {};
    const limit = Number.isFinite(duration) && duration > 0 ? duration : 60;
    const segments: TranscriptSegment[] = [];
    let used = 0;
    for (const item of Array.isArray(value.segments) ? value.segments.slice(0, TRANSCRIPT_MAX_SEGMENTS) : []) {
        const raw = item && typeof item === 'object' ? item as { start?: unknown; end?: unknown; text?: unknown } : {};
        const text = clean(raw.text), start = Number(raw.start), end = Number(raw.end);
        if (!text || !Number.isFinite(start) || !Number.isFinite(end) || used + text.length > TRANSCRIPT_MAX_CHARS)
            continue;
        const from = Math.min(Math.max(0, start, segments.at(-1)?.end ?? 0), limit);
        segments.push({ start: round(from), end: round(Math.min(Math.max(from, end), limit)), text });
        used += text.length + 1;
    }
    if (segments.length)
        return { text: segments.map(segment => segment.text).join(' '), segments };
    const text = clean(value.text);
    if (!text || text.length > TRANSCRIPT_MAX_CHARS)
        return null;
    return { text, segments: spread(text, limit) };
}
/** Index of the sentence being spoken at `time`, or -1 before the first one starts. */
export function activeSegment(segments: TranscriptSegment[], time: number) {
    let found = -1;
    for (let index = 0; index < segments.length && segments[index].start <= time; index++)
        found = index;
    return found;
}
