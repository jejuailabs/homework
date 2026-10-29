'use client';
import { useEffect, useRef, useState } from 'react';
import { activeSegment, type VoiceTranscript } from './transcript';
/** Plays the recording; when a transcript exists, the sentence being spoken is highlighted beside the player. */
export default function VoicePlayer({ src, label, en = false, transcript = null }: {
    src: string;
    label: string;
    en?: boolean;
    transcript?: VoiceTranscript | null;
}) {
    const [failed, setFailed] = useState(false), [time, setTime] = useState(-1), audio = useRef<HTMLAudioElement>(null), list = useRef<HTMLOListElement>(null);
    useEffect(() => { setFailed(false); setTime(-1); }, [src]);
    const segments = transcript?.segments || [], current = time < 0 ? -1 : activeSegment(segments, time);
    useEffect(() => { const item = current >= 0 ? list.current?.children[current] as HTMLElement | undefined : undefined;
        if (item && list.current)
            list.current.scrollTop = item.offsetTop - list.current.clientHeight / 3; }, [current]); // the list is position:relative
    function seek(start: number) { const player = audio.current; if (!player)
        return; player.currentTime = start; setTime(start); void player.play().catch(() => undefined); }
    const player = <><audio ref={audio} controls preload="none" src={src} aria-label={label} onError={() => setFailed(true)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onSeeked={e => setTime(e.currentTarget.currentTime)} onEnded={() => setTime(-1)}/>{failed && <p className="am-note">{en ? 'This browser could not play the recording.' : '이 브라우저에서 녹음을 재생하지 못했어요.'} <a href={src} target="_blank" rel="noopener noreferrer">{en ? 'Open audio file' : '음성 파일 열기'}</a></p>}</>;
    if (!segments.length)
        return player;
    return <div className="am-voice-player">
        <div className="am-voice-audio">{player}</div>
        <div className="am-transcript"><span className="am-transcript-title">{en ? 'Subtitles' : '자막'}</span>
            <ol ref={list} aria-label={en ? 'Recording subtitles' : '녹음 자막'}>{segments.map((segment, index) => <li key={index} aria-current={index === current ? 'true' : undefined} className={index === current ? 'am-on' : index < current ? 'am-past' : ''}><button type="button" onClick={() => seek(segment.start)} title={en ? 'Play from here' : '여기부터 듣기'}>{segment.text}</button></li>)}</ol>
        </div>
    </div>;
}
