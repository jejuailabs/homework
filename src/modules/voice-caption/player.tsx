'use client';
import { useEffect, useState } from 'react';
export default function VoicePlayer({ src, label, en = false }: {
    src: string;
    label: string;
    en?: boolean;
}) { const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [src]); return <><audio controls preload="none" src={src} aria-label={label} onError={() => setFailed(true)}/>{failed && <p className="am-note">{en ? 'This browser could not play the recording.' : '이 브라우저에서 녹음을 재생하지 못했어요.'} <a href={src} target="_blank" rel="noopener noreferrer">{en ? 'Open audio file' : '음성 파일 열기'}</a></p>}</>; }
