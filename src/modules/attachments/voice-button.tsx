'use client';
import {Mic, Square} from 'lucide-react';
import {useVoiceInput} from '@/modules/berry-panel/voice';
import './styles.css';

/**
 * Mic button for a teacher's text box: press to dictate, press again to stop. The heard words are added to what is
 * already typed. Hidden where the browser has no speech recognition (Firefox).
 */
export default function VoiceButton({value, onChange, disabled, className = ''}: {value: string; onChange: (value: string) => void; disabled?: boolean; className?: string}) {
  const voice = useVoiceInput(value, onChange);
  if (!voice.supported) return null;
  const label = voice.listening ? '음성 입력 멈추기' : '말로 입력하기';
  return <span className={`att-voice ${className}`}>
    <button type="button" className={`att-mic${voice.listening ? ' is-listening' : ''}`} aria-label={label} aria-pressed={voice.listening} title={label} disabled={disabled} onClick={voice.toggle}>{voice.listening ? <Square size={14}/> : <Mic size={16}/>}</button>
    {voice.listening && <small role="status">듣고 있어요</small>}
    {voice.error && <small className="att-voice-error" role="alert">{voice.error}</small>}
  </span>;
}
