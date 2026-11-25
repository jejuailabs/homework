'use client';
import {createContext, useEffect, useState, type ReactNode} from 'react';
import {Play} from 'lucide-react';
import '@/styles/artwork-video.css';

/** True where a video artwork gets the big play button (the teacher's exhibition screens). Elsewhere screens keep what they had. */
export const VideoPlayContext = createContext(false);
export function VideoPlayOn({children}: {children: ReactNode}) {return <VideoPlayContext.Provider value={true}>{children}</VideoPlayContext.Provider>;}

/** A video artwork: the poster with a play button, then the video itself once pressed. */
export default function ArtworkVideo({src, poster, title, english = false}: {src: string; poster?: string; title: string; english?: boolean}) {
  const [started, setStarted] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {setStarted(false); setFailed(false);}, [src]);
  if (!started) return <div className="art-video">
    {poster ? <img src={poster} alt={title}/> : <div className="art-video-blank" aria-hidden="true"/>}
    <button type="button" className="art-video-play" onClick={event => {event.stopPropagation(); setStarted(true);}} aria-label={english ? `Play ${title}` : `${title} 영상 재생`}><Play size={34} fill="currentColor"/></button>
  </div>;
  return <div className="art-video is-playing">
    <video src={src} poster={poster} controls autoPlay playsInline preload="auto" aria-label={title} onError={() => setFailed(true)}/>
    {failed && <p role="alert">{english ? 'This video cannot be played right now. Please try again in a moment.' : '영상을 지금 재생할 수 없어요. 잠시 뒤 다시 눌러 주세요.'}</p>}
  </div>;
}
