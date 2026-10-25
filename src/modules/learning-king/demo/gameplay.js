(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const button = (label, action, className) => `<button type="button" class="${className}" ${action}>${label}</button>`;
  const stageName = subject => subject === 'math' ? '별빛 관측소' : '별빛 이야기 탐험';
  const stageNumber = subject => subject === 'math' ? '01' : '02';

  function cast(countdown = false) {
    return `<div class="gq-cast" aria-hidden="true"><div class="gq-speech">${countdown ? '준비됐어? 같이 가자!' : '차근차근, 잘하고 있어!'}</div><div class="gq-companion comet"></div></div><div class="gq-sidekick" aria-hidden="true"></div>`;
  }

  function hud(live, label) {
    return `<header class="gq-hud">${button('← 나가기', 'data-cancel aria-label="도전을 그만하고 랭킹 로비로 돌아가기"', 'gq-exit')}<div class="gq-stage-label"><small>STAGE ${stageNumber(live.subject)} · ${label}</small><strong>${stageName(live.subject)}</strong></div><div class="gq-clock"><small>남은 시간</small><b data-clock>120.0초</b></div></header>`;
  }

  function route(live) {
    const completed = live.answers.length;
    return `<div class="gq-route" aria-label="다섯 문제 중 ${completed}문제 완료"><span class="gq-route-line" style="--progress:${completed * 25}%" aria-hidden="true"></span>${Array.from({length: 5}, (_, i) => `<span class="gq-step ${i < completed ? 'complete' : i === completed ? 'current' : 'future'}" ${i === completed ? 'aria-current="step"' : ''}>${i < completed ? '★' : i + 1}</span>`).join('')}</div>`;
  }

  function countdown(live, label) {
    const number = Math.max(1, Math.ceil((live.prepareAt + 3000 - Date.now()) / 1000));
    return `<section class="gq-scene" data-subject="${live.subject}" aria-label="솔로 도전 준비">${hud(live, label)}${route(live)}<div class="gq-center"><div class="gq-countdown"><span class="gq-ready-label">READY TO EXPLORE</span><div class="gq-countdown-number" data-countdown aria-live="polite">${number}</div><h1>다섯 개의 별을 찾아서</h1><p>문제를 풀며 별 조각을 모아봐!<br>준비가 끝나면 시간이 시작돼.</p></div></div>${cast(true)}<footer class="gq-bottom"><span class="gq-collected">✦ 별 조각 0 / 5</span><span class="gq-feedback">정확하게 풀수록 더 높은 기록!</span><span class="gq-shortcut">숫자 1 · 2 · 3으로 선택</span></footer></section>`;
  }

  function playing(live, model, label) {
    const index = live.answers.length;
    const question = model.questions[live.subject][index];
    const feedback = index ? `${index}번째 별 조각 획득! 다음 별로 출발!` : '첫 번째 별 조각을 찾아보자!';
    return `<section class="gq-scene" data-subject="${live.subject}" aria-label="진행 중인 솔로 도전">${hud(live, label)}${route(live)}<div class="gq-center"><div class="gq-eyebrow">MISSION ${String(index + 1).padStart(2, '0')} <span>/ 05</span></div><section class="gq-question-card"><p class="gq-prompt">${live.subject === 'math' ? '별에 숨겨진 숫자는?' : '말 속에 숨겨진 별을 찾아봐!'}</p><h1 class="gq-question" data-question tabindex="-1">${esc(question.q)}</h1></section><div class="gq-options ${question.answers.some(a => a.length > 8) ? 'long' : ''}" aria-label="정답 선택">${question.answers.map((answer, i) => button(`<span class="gq-key">${i + 1}</span><span class="gq-answer-text">${esc(answer)}</span>`, `data-answer="${esc(answer)}" data-question-id="${question.id}" aria-label="${esc(answer)}"`, 'gq-answer')).join('')}</div><p class="gq-progress-note">첫 선택이 기록돼요 · 정답과 풀이는 여행이 끝나면 확인해요</p></div>${cast()}<footer class="gq-bottom"><span class="gq-collected">✦ 별 조각 ${index} / 5</span><span class="gq-feedback" role="status">${feedback}</span><span class="gq-shortcut">숫자 1 · 2 · 3으로 선택</span></footer></section>`;
  }

  function result(live, model, best, label) {
    const record = model.score(live.answers);
    const answered = live.answers.filter(a => a.answer !== null).length;
    const title = live.timedOut ? '오늘의 탐험 기록' : '별빛 탐험 완료!';
    return `<section class="gq-scene gq-result-scene" data-subject="${live.subject}" aria-label="솔로 도전 결과"><header class="gq-hud">${button('← 로비', 'data-see-ranks', 'gq-exit')}<div class="gq-stage-label"><small>STAGE ${stageNumber(live.subject)} · ${label}</small><strong>${stageName(live.subject)}</strong></div><span class="gq-completion">${live.timedOut ? '시간 종료' : 'STAGE CLEAR'}</span></header><div class="gq-result-center"><div class="gq-trophy" aria-hidden="true">★</div><span class="gq-result-kicker">${answered}개의 별 조각을 모았어요</span><h1 data-result-title tabindex="-1">${title}</h1><div class="gq-score"><b>${record.score.toLocaleString('ko-KR')}</b><span>점</span></div><div class="gq-stats"><div><small>정확도</small><strong>${record.accuracy}%</strong></div><div><small>정답</small><strong>${record.correct}<span> / 5</span></strong></div><div><small>문항 평균</small><strong>${record.averageSeconds.toFixed(2)}<span>초</span></strong></div></div><p class="gq-result-message">정확도 ${record.accuracyPoints}점 + 속도 ${Math.round(record.speedPoints)}점<br>${live.recordUpdated ? '새로운 대표 기록을 만들었어!' : `대표 기록 ${best.score}점은 그대로 지켰어!`}</p><div class="gq-result-actions">${button('랭킹에서 내 기록 보기', 'data-see-ranks', 'gq-primary')}${button('한 번 더 탐험', 'data-start', 'gq-secondary')}</div><details class="gq-review"><summary>정답과 풀이 확인하기</summary><ol>${live.answers.map((answer, i) => {const q = model.questions[live.subject][i];return `<li><b>${esc(q.q)}</b><span class="gq-review-verdict ${answer.correct ? 'correct' : ''}">${answer.answer === null ? '미응답' : answer.correct ? '정답' : '다시 생각해봐요'}</span><p>${answer.answer === null ? '' : `내 답 ${esc(answer.answer)} · `}정답 ${esc(q.correct)} · ${answer.seconds.toFixed(1)}초<br>${esc(q.explanation)}</p></li>`;}).join('')}</ol></details></div><div class="gq-result-companion" aria-hidden="true"></div></section>`;
  }

  global.LearningKingGame = {
    render({live, model, best, subjectNames}) {
      const label = subjectNames[live.subject];
      if (live.status === 'countdown') return countdown(live, label);
      if (live.status === 'done') return result(live, model, best, label);
      return playing(live, model, label);
    },
  };
})(globalThis);
