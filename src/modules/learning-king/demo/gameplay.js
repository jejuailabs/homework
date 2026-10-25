(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const button = (label, action, className) => `<button type="button" class="${className}" ${action}>${label}</button>`;
  const isJourney = live => live.subject === 'math' && live.mode === 'journey';
  const stageName = live => isJourney(live) ? `초${live.grade} 수학 여행` : live.subject === 'math' ? '별빛 관측소' : '별빛 이야기 탐험';
  const stageNumber = live => isJourney(live) ? `여행 ${live.sequence + 1}` : `STAGE ${live.subject === 'math' ? '01' : '02'}`;
  const questionsFor = (live, model) => isJourney(live) ? live.questions : model.questions[live.subject];
  const countFor = live => isJourney(live) ? live.questions.length : 5;
  const number = value => Number(value || 0).toLocaleString('ko-KR');
  const elapsed = answers => answers.reduce((total, answer) => total + (Number(answer.seconds) || 0), 0);

  function cast(countdown = false) {
    return `<div class="gq-cast" aria-hidden="true"><div class="gq-speech">${countdown ? '준비됐어? 같이 가자!' : '차근차근, 잘하고 있어!'}</div><div class="gq-companion comet"></div></div><div class="gq-sidekick" aria-hidden="true"></div>`;
  }

  function hud(live, label) {
    const journey = isJourney(live);
    return `<header class="gq-hud">${button(journey ? '← 저장하고 나가기' : '← 나가기', `data-cancel aria-label="${journey ? '진행한 문제를 저장하고 여행 로비로 돌아가기' : '도전을 그만하고 랭킹 로비로 돌아가기'}"`, 'gq-exit')}<div class="gq-stage-label"><small>${stageNumber(live)} · ${label}</small><strong>${stageName(live)}</strong></div><div class="gq-clock"><small>${journey ? '풀이 시간' : '남은 시간'}</small><b data-clock>${journey ? `${elapsed(live.answers).toFixed(1)}초` : '120.0초'}</b></div></header>`;
  }

  function route(live) {
    const count = countFor(live);
    const completed = live.answers.length;
    const perStop = count / 5;
    const currentStop = Math.floor(completed / perStop);
    return `<div class="gq-route" aria-label="${count}문제 중 ${completed}문제 완료"><span class="gq-route-line" style="--progress:${Math.min(100, completed / (count - perStop) * 100)}%" aria-hidden="true"></span>${Array.from({length: 5}, (_, i) => `<span class="gq-step ${i < currentStop ? 'complete' : i === currentStop ? 'current' : 'future'}" ${i === currentStop ? 'aria-current="step"' : ''}>${i < currentStop ? '★' : i + 1}</span>`).join('')}</div>`;
  }

  function countdown(live, label) {
    const count = countFor(live);
    const journey = isJourney(live);
    const remaining = Math.max(1, Math.ceil((live.prepareAt + 3000 - Date.now()) / 1000));
    return `<section class="gq-scene ${journey ? 'gq-journey' : ''}" data-subject="${live.subject}" aria-label="${journey ? '수학 여행 준비' : '솔로 도전 준비'}">${hud(live, label)}${route(live)}<div class="gq-center"><div class="gq-countdown"><span class="gq-ready-label">READY TO EXPLORE</span><div class="gq-countdown-number" data-countdown aria-live="polite">${remaining}</div><h1>${journey ? live.answers.length ? '남은 별을 찾으러 출발!' : '스무 문제의 별빛 여행' : '다섯 개의 별을 찾아서'}</h1><p>${journey ? '시간제한 없이, 내 속도로 풀어봐!<br>한 문제씩 풀 때마다 기록이 쌓여.' : '문제를 풀며 별 조각을 모아봐!<br>준비가 끝나면 시간이 시작돼.'}</p></div></div>${cast(true)}<footer class="gq-bottom"><span class="gq-collected">✦ 별 조각 ${live.answers.length} / ${count}</span><span class="gq-feedback">${journey ? '네 문제마다 새로운 별에 도착해요' : '정확하게 풀수록 더 높은 기록!'}</span><span class="gq-shortcut">숫자 1 · 2 · 3으로 선택</span></footer></section>`;
  }

  function playing(live, model, label) {
    const index = live.answers.length;
    const count = countFor(live);
    const journey = isJourney(live);
    const question = questionsFor(live, model)[index];
    const feedback = index ? `${index}번째 별 조각 획득! 다음 별로 출발!` : '첫 번째 별 조각을 찾아보자!';
    return `<section class="gq-scene ${journey ? 'gq-journey' : ''}" data-subject="${live.subject}" aria-label="${journey ? '진행 중인 수학 여행' : '진행 중인 솔로 도전'}">${hud(live, label)}${route(live)}<div class="gq-center"><div class="gq-eyebrow">MISSION ${String(index + 1).padStart(2, '0')} <span>/ ${String(count).padStart(2, '0')}</span></div><section class="gq-question-card"><p class="gq-prompt">${journey ? '오늘의 수학, 차근차근 풀어봐!' : live.subject === 'math' ? '별에 숨겨진 숫자는?' : '말 속에 숨겨진 별을 찾아봐!'}</p><h1 class="gq-question ${question.q.length > 24 ? 'gq-question-story' : ''}" data-question tabindex="-1">${esc(question.q)}</h1></section><div class="gq-options ${question.answers.some(a => String(a).length > 8) ? 'long' : ''}" aria-label="정답 선택">${question.answers.map((answer, i) => button(`<span class="gq-key">${i + 1}</span><span class="gq-answer-text">${esc(answer)}</span>`, `data-answer="${esc(answer)}" data-question-id="${esc(question.id)}" aria-label="${esc(answer)}"`, 'gq-answer')).join('')}</div><p class="gq-progress-note" ${journey ? 'data-game-storage role="status"' : ''}>${journey ? '푼 문제는 바로 기록돼요 · 언제든 저장하고 쉬어가요' : '첫 선택이 기록돼요 · 정답과 풀이는 여행이 끝나면 확인해요'}</p></div>${cast()}<footer class="gq-bottom"><span class="gq-collected">✦ 별 조각 ${index} / ${count}</span><span class="gq-feedback" role="status">${feedback}</span><span class="gq-shortcut">숫자 1 · 2 · 3으로 선택</span></footer></section>`;
  }

  function review(live, model) {
    const questions = questionsFor(live, model);
    return `<details class="gq-review"><summary>정답과 풀이 확인하기</summary><ol>${live.answers.map((answer, i) => {const q = questions[i];return `<li><b>${esc(q.q)}</b><span class="gq-review-verdict ${answer.correct ? 'correct' : ''}">${answer.answer === null ? '미응답' : answer.correct ? '정답' : '다시 생각해봐요'}</span><p>${answer.answer === null ? '' : `내 답 ${esc(answer.answer)} · `}정답 ${esc(q.correct)} · ${Number(answer.seconds).toFixed(1)}초<br>${esc(q.explanation)}</p></li>`;}).join('')}</ol></details>`;
  }

  function result(live, model, best, label, journey) {
    const record = model.score(live.answers);
    const answered = live.answers.filter(a => a.answer !== null).length;
    const mathJourney = isJourney(live);
    const count = countFor(live);
    const title = mathJourney ? `여행 ${live.sequence + 1}, 완주했어!` : live.timedOut ? '오늘의 탐험 기록' : '별빛 탐험 완료!';
    const message = mathJourney ? `정확하게 푼 만큼 쌓인 여행 점수예요.<br>지금까지 ${number(journey?.totalAnswered ?? answered)}문제 · ${number(journey?.completedLegs ?? 1)}번의 여행 완주` : `정확도 ${record.accuracyPoints}점 + 속도 ${Math.round(record.speedPoints)}점<br>${live.recordUpdated ? '새로운 대표 기록을 만들었어!' : `대표 기록 ${best.score}점은 그대로 지켰어!`}`;
    return `<section class="gq-scene gq-result-scene ${mathJourney ? 'gq-journey' : ''}" data-subject="${live.subject}" aria-label="${mathJourney ? '수학 여행 결과' : '솔로 도전 결과'}"><header class="gq-hud">${button('← 로비', 'data-see-ranks', 'gq-exit')}<div class="gq-stage-label"><small>${stageNumber(live)} · ${label}</small><strong>${stageName(live)}</strong></div><span class="gq-completion">${live.timedOut ? '시간 종료' : 'STAGE CLEAR'}</span></header><div class="gq-result-center"><div class="gq-trophy" aria-hidden="true">★</div><span class="gq-result-kicker">${answered}${mathJourney ? ` / ${count}` : '개'}의 별 조각을 모았어요</span><h1 data-result-title tabindex="-1">${title}</h1><div class="gq-score"><b>${record.score.toLocaleString('ko-KR')}</b><span>점</span></div><div class="gq-stats"><div><small>정확도</small><strong>${record.accuracy}%</strong></div><div><small>정답</small><strong>${record.correct}<span> / ${count}</span></strong></div><div><small>${mathJourney ? '풀이 시간' : '문항 평균'}</small><strong>${mathJourney ? elapsed(live.answers).toFixed(1) : record.averageSeconds.toFixed(2)}<span>초</span></strong></div></div><p class="gq-result-message">${message}</p>${mathJourney ? '<p class="gq-progress-note" data-game-storage role="status"></p>' : ''}<div class="gq-result-actions">${mathJourney ? `${button('다음 여행 출발', 'data-next-leg', 'gq-primary')}${button('여행 로비로', 'data-see-ranks', 'gq-secondary')}` : `${button('랭킹에서 내 기록 보기', 'data-see-ranks', 'gq-primary')}${button('한 번 더 탐험', 'data-start', 'gq-secondary')}`}</div>${review(live, model)}</div><div class="gq-result-companion" aria-hidden="true"></div></section>`;
  }

  function renderLobby({grade = 4, level = 'gentle', totalAnswered = 0, totalCorrect = 0, completedLegs = 0, bankCount = 0, recent = [], active = null, storageStatus = 'saved'} = {}) {
    const waiting = storageStatus === 'loading';
    const locked = Boolean(active) || waiting;
    const disabled = locked ? ' disabled' : '';
    const done = active?.answers?.length || 0;
    const accuracy = totalAnswered ? `${Math.round(totalCorrect / totalAnswered * 100)}%` : '—';
    const statuses = {loading: '저장한 여행을 불러오고 있어요', saving: '이 브라우저에 기록을 저장하고 있어요', saved: '이 브라우저에 저장 · 학생 연동 전', unavailable: '브라우저 저장을 사용할 수 없어 이번 창에서만 기록돼요'};
    const history = recent.length ? `<ol>${recent.slice(-20).reverse().map(item => `<li><div><span class="jm-history-verdict ${item.correct ? 'correct' : ''}">${item.correct ? '정답' : '복습'}</span><b>${esc(item.q)}</b></div><p>내 답 ${esc(item.answer)} · 정답 ${esc(item.correctAnswer)}${Number.isFinite(Number(item.seconds)) ? ` · ${Number(item.seconds).toFixed(1)}초` : ''}<br>${esc(item.explanation)}</p></li>`).join('')}</ol>` : '<p class="jm-history-empty">첫 문제를 풀면 여기에 정답과 풀이가 쌓여요.</p>';
    return `<section class="jm-lobby" aria-label="수학 여행"><div class="jm-hero"><div class="jm-hero-copy"><span class="jm-kicker">MATH JOURNEY</span><h1>매일 새롭게,<br>나만의 수학 여행</h1><p>학년을 고르면 알맞은 수학 문제가 준비돼요.<br>스무 문제를 풀고, 다음 여행으로 계속 떠나봐요.</p><div class="jm-path" aria-label="새 문제, 풀이 기록, 다음 여행"><span>✦ 새 문제 20개</span><i>→</i><span>풀이 기록</span><i>→</i><span>다음 여행</span></div></div><div class="jm-hero-character" aria-hidden="true"></div><span class="jm-hero-mark" aria-hidden="true">지금까지<br><b>${number(completedLegs)}</b>번의 여행</span></div><div class="jm-setup"><div class="jm-options"><fieldset><legend>어느 학년으로 떠날까요?</legend><div class="jm-grades">${Array.from({length: 6}, (_, index) => {const value = index + 1;return button(`${value}학년`, `data-grade="${value}" aria-pressed="${Number(grade) === value}"${disabled}`, Number(grade) === value ? 'selected' : '');}).join('')}</div></fieldset><fieldset><legend>오늘의 걸음</legend><div class="jm-levels">${button('차근차근 <small>기초부터 편하게</small>', `data-level="gentle" aria-pressed="${level === 'gentle'}"${disabled}`, level === 'gentle' ? 'selected' : '')}${button('알맞게 <small>익숙한 것부터 골고루</small>', `data-level="standard" aria-pressed="${level === 'standard'}"${disabled}`, level === 'standard' ? 'selected' : '')}</div></fieldset></div><div class="jm-departure"><span class="jm-ticket-label">${active ? '다시 만난 여행' : '다음 목적지'}</span><strong>초${esc(grade)} · 별빛 관측소</strong><p>${active ? `${done} / 20문제 완료 · 이어서 출발해요` : '20문제 · 시간제한 없이 내 속도로'}</p>${button(waiting ? '기록 불러오는 중…' : active ? '이어서 여행하기 →' : '수학 여행 출발 →', `data-start${waiting ? ' disabled' : ''}`, 'jm-start')}<small>${active ? '진행한 풀이 기록은 계속 남아요' : '네 문제마다 새로운 별에 도착해요'}</small>${active ? button('새 여행 고르기', 'data-discard', 'jm-discard') : ''}</div></div><div class="jm-journal"><div class="jm-stat"><small>보관한 문제</small><strong>${number(bankCount)}<span>개</span></strong></div><div class="jm-stat"><small>누적 풀이</small><strong>${number(totalAnswered)}<span>문제</span></strong></div><div class="jm-stat"><small>여행 완주</small><strong>${number(completedLegs)}<span>번</span></strong></div><div class="jm-stat"><small>누적 정확도</small><strong>${accuracy}</strong></div></div><div class="jm-storage ${storageStatus === 'unavailable' ? 'unavailable' : ''}" role="status"><span aria-hidden="true">${storageStatus === 'unavailable' ? '!' : '✓'}</span><span data-storage-note>${statuses[storageStatus] || statuses.saved}</span><small>문제 보관함은 최근 300개 · 풀이 합계는 계속 누적</small></div><details class="jm-history"><summary>나의 풀이 보관함 <span>최근 ${Math.min(20, recent.length)}문제</span></summary>${history}</details></section>`;
  }

  global.LearningKingGame = {
    render({live, model, best, subjectNames, journey}) {
      const label = subjectNames[live.subject];
      if (live.status === 'countdown') return countdown(live, label);
      if (live.status === 'done') return result(live, model, best, label, journey);
      return playing(live, model, label);
    },
    renderLobby,
  };
})(globalThis);
