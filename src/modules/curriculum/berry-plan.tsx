'use client';
import {useState} from 'react';
import {ArrowLeft, ChevronRight, Clock3, ShieldCheck, Sparkles, X} from 'lucide-react';
import {BERRY_MAX_SECONDS, BERRY_TASKS, type BerryTask} from './berry-tasks';

/**
 * "베리가 이렇게 진행할게요" 확인 창. task가 있으면 그 계획을 바로, 없으면 맡길 일 목록부터 보여 준다.
 * [이대로 맡기기]를 눌러야 베리 창에 문장이 간다.
 */
export default function BerryPlan({task, onConfirm, onClose}: {task: BerryTask | null; onConfirm: (task: BerryTask) => void; onClose: () => void}) {
  const [picked, setPicked] = useState<BerryTask | null>(task);
  const choosing = !picked;
  return <div className="cur-dialog" role="dialog" aria-modal="true" aria-label={choosing ? '베리에게 맡길 일 고르기' : '베리 작업 계획'} onClick={onClose}>
    <div className="cur-dialog-card bp" onClick={event => event.stopPropagation()}>
      <header>
        {!choosing && !task && <button className="cur-icon" aria-label="목록으로" onClick={() => setPicked(null)}><ArrowLeft size={18}/></button>}
        <div><span className="bp-eyebrow"><Sparkles size={14}/>베리</span><h3>{choosing ? '무엇을 맡길까요?' : '이렇게 진행할게요'}</h3></div>
        <button className="cur-icon" aria-label="닫기" onClick={onClose}><X size={18}/></button>
      </header>

      {choosing ? <ul className="bp-tasks">{BERRY_TASKS.map(item => <li key={item.key}><button onClick={() => setPicked(item)}>
        <strong>{item.title}</strong><small>{item.steps.length}단계 · {item.result}</small><ChevronRight size={16}/>
      </button></li>)}</ul> : <>
        <p className="bp-title">{picked.title}</p>
        <ol className="bp-steps">{picked.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
        <dl className="bp-facts">
          <div><dt>받는 것</dt><dd>{picked.result}</dd></div>
          <div><dt><ShieldCheck size={14}/>자료</dt><dd>{picked.changes}</dd></div>
          <div><dt><Clock3 size={14}/>시간</dt><dd>보내면 베리 창이 열려요. 보통 수십 초, 길면 {BERRY_MAX_SECONDS}초까지 걸려요.</dd></div>
          {picked.needsInput && <div><dt>할 일</dt><dd>{picked.needsInput}</dd></div>}
        </dl>
        <details className="bp-prompt"><summary>베리에게 보낼 문장</summary><p>{picked.prompt}</p></details>
        <footer><button className="cur-btn is-ghost" onClick={onClose}>취소</button><button className="cur-btn is-berry" onClick={() => onConfirm(picked)}><Sparkles size={16}/>이대로 맡기기</button></footer>
      </>}
    </div>
  </div>;
}
