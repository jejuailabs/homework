import type {MockId} from './types';

// Illustrated screen examples drawn with HTML/CSS. They show the shape of each
// feature without any real student data, and stay sharp at every size.

const kids = [
  {name: '하늘', img: '/characters/cat-mochi.webp'},
  {name: '도윤', img: '/characters/dog-dubu.webp'},
  {name: '서아', img: '/characters/rabbit-tori.webp'},
  {name: '지호', img: '/characters/hamster-kong.webp'},
  {name: '유나', img: '/characters/alpaca-cloud.webp'},
  {name: '민준', img: '/characters/otter-moa.webp'},
];

function Frame({title, children, tone}: {title: string; children: React.ReactNode; tone?: string}) {
  return (
    <div className={`ps-mock ${tone ?? ''}`} aria-hidden="true">
      <div className="ps-mock-bar"><i/><i/><i/><span>{title}</span></div>
      <div className="ps-mock-body">{children}</div>
    </div>
  );
}

function Avatar({i}: {i: number}) {
  const k = kids[i % kids.length];
  return <img className="ps-ava" src={k.img} alt="" width="34" height="34" loading="lazy"/>;
}

export default function Mockup({id}: {id: MockId}) {
  switch (id) {
    case 'homework-list':
      return (
        <Frame title="숙제 · 4학년 2반">
          {[['독서 감상문 쓰기', '제출 21/24', 'ok'], ['과학 관찰 일지 사진', '제출 18/24', 'mid'], ['수학 익힘 3단원', '마감 내일', 'due']].map(([t, s, c], i) => (
            <div className="ps-row" key={t}><span className={`ps-dot ${c}`}/><b>{t}</b><em>{s}</em><span className="ps-bar"><span style={{width: `${[88, 75, 40][i]}%`}}/></span></div>
          ))}
          <div className="ps-chiprow"><span className="ps-chip on">진행 중</span><span className="ps-chip">마감</span><span className="ps-chip">보관함</span></div>
        </Frame>
      );
    case 'homework-review':
      return (
        <Frame title="제출물 확인 · 독서 감상문">
          <div className="ps-grid3">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div className="ps-sub" key={i}><Avatar i={i}/><span>{kids[i].name}</span><div className="ps-paper"/>{i < 4 ? <small className="ps-done">검사 완료</small> : <small>확인 전</small>}</div>
            ))}
          </div>
          <div className="ps-reply"><b>선생님 말씀</b> 주인공 마음을 자세히 적었네! 다음엔 내 경험도 한 줄 더해 볼까? 👍</div>
        </Frame>
      );
    case 'homework-submit':
      return (
        <Frame title="학생 화면 · 오늘 할 숙제">
          <div className="ps-phone">
            <div className="ps-card-hw"><b>과학 관찰 일지 사진</b><small>제출 방식 · 이미지 업로드 · 마감 금요일</small></div>
            <div className="ps-upload">📷 사진 찍어 올리기</div>
            <div className="ps-btn">제출하기 →</div>
          </div>
        </Frame>
      );
    case 'exhibition-wall':
      return (
        <Frame title="전시실 · 봄 그림전">
          <div className="ps-wall">
            {['#f6c9b5', '#c8dfc4', '#bfd5ec', '#f3e1a6', '#dcc8ec', '#f5c6d4'].map((c, i) => (
              <figure key={c} className="ps-art"><div style={{background: `linear-gradient(135deg, ${c}, #fff)`}}><Avatar i={i}/></div><figcaption>{kids[i].name}의 작품</figcaption></figure>
            ))}
          </div>
        </Frame>
      );
    case 'exhibition-world':
      return (
        <Frame title="3D 전시관 둘러보기" tone="dark">
          <div className="ps-world">
            <img src="/exhibition-world/v1/gallery/g10.webp" alt="" loading="lazy"/>
            <img src="/exhibition-world/v1/gallery/g10.webp" alt="" loading="lazy"/>
            <img src="/exhibition-world/v1/gallery/g10.webp" alt="" loading="lazy"/>
            <span className="ps-joy">◀ ▲ ▶</span>
          </div>
        </Frame>
      );
    case 'berry-chat':
      return (
        <Frame title="베리 · 선생님의 AI 비서">
          <div className="ps-chat">
            <p className="me">이번 주 독서 감상문 안 낸 학생 알려 줘</p>
            <p className="bot"><img src="/berry/blueberry-64.webp" alt="" width="24" height="24"/>아직 3명이 내지 않았어요: 학생 07, 학생 12, 학생 19. 안내 문구를 만들어 드릴까요?</p>
            <p className="me">응, 다정하게 써 줘</p>
            <p className="bot"><img src="/berry/raspberry-64.webp" alt="" width="24" height="24"/>“금요일까지 감상문을 올려 주면 선생님이 꼭 읽어 볼게요!” 이렇게 쓰면 어떨까요?</p>
          </div>
        </Frame>
      );
    case 'berry-preview':
      return (
        <Frame title="베리 · 저장 전 미리보기">
          <div className="ps-preview">
            <b>새 숙제 만들기</b>
            <dl><dt>제목</dt><dd>우리 동네 봄 찾기 사진</dd><dt>제출 방식</dt><dd>이미지 업로드</dd><dt>마감</dt><dd>금요일</dd></dl>
            <div className="ps-btns"><span className="ps-btn ghost">고치기</span><span className="ps-btn">저장</span></div>
          </div>
        </Frame>
      );
    case 'board':
      return (
        <Frame title="참여보드 · 오늘 배운 점">
          <div className="ps-board">
            {['비유 표현을 찾았어요', '분수 덧셈이 재밌었어요', '모둠 발표 최고!', '질문이 있어요 🙋', '실험 결과가 신기했어요'].map((t, i) => (
              <div key={t} className="ps-note" style={{background: ['#fff3b8', '#d8f0dc', '#dbe8fb', '#fbe0e6', '#ece1fb'][i]}}><span>{t}</span><small>{kids[i].name}</small></div>
            ))}
          </div>
        </Frame>
      );
    case 'poll':
      return (
        <Frame title="학급 투표 · 체험학습 장소">
          {[['과학관', 46], ['미술관', 29], ['식물원', 25]].map(([t, v]) => (
            <div className="ps-poll" key={t}><span>{t}</span><span className="ps-bar big"><span style={{width: `${v}%`}}/></span><b>{v}%</b></div>
          ))}
          <small className="ps-muted">24명 중 22명 참여 · 금요일 마감</small>
        </Frame>
      );
    case 'canvas':
      return (
        <Frame title="함께캔버스 · 모둠 마인드맵">
          <div className="ps-canvas">
            <span className="c0">우리 마을</span><span className="c1">시장</span><span className="c2">공원</span><span className="c3">도서관</span><span className="c4">버스 정류장</span>
            <svg viewBox="0 0 300 150"><path d="M150 75 L60 30 M150 75 L240 30 M150 75 L60 120 M150 75 L240 120"/></svg>
          </div>
        </Frame>
      );
    case 'cards':
      return (
        <Frame title="단어 카드 · 과일 영어">
          <div className="ps-cards">
            {[['apple', '사과', '🍎'], ['grape', '포도', '🍇'], ['peach', '복숭아', '🍑']].map(([e, k, em]) => (
              <div className="ps-flash" key={e}><span className="em">{em}</span><b>{e}</b><small>{k}</small><span className="spk">🔊</span></div>
            ))}
          </div>
        </Frame>
      );
    case 'cards-game':
      return (
        <Frame title="카드 놀이 · 짝 맞추기">
          <div className="ps-match">{['apple', '포도', '🍑', 'grape', '사과', 'peach'].map((t, i) => <span key={t} className={i === 1 || i === 3 ? 'hit' : ''}>{t}</span>)}</div>
          <div className="ps-score">⏱ 0:42 · ⭐ 8점 · 연속 정답 3</div>
        </Frame>
      );
    case 'points-shop':
      return (
        <Frame title="작은 상점 · 보말로 꾸미기">
          <div className="ps-shop">
            {[['꽃 머리핀', 20], ['별빛 망토', 40], ['나무 책상', 30]].map(([t, p]) => (
              <div key={t as string}><b>{t}</b><span>🪙 {p}</span></div>
            ))}
          </div>
          <div className="ps-wallet">내 보말 🪙 124</div>
        </Frame>
      );
    case 'my-space':
      return (
        <Frame title="나의 작은 세상">
          <div className="ps-room"><img src="/my-space/v1/room.webp" alt="" loading="lazy"/><img className="pet" src="/characters/cat-mochi.webp" alt="" loading="lazy"/></div>
        </Frame>
      );
    case 'diary':
      return (
        <Frame title="비밀 일기">
          <div className="ps-diary"><img src="/diary/v1/mood-happy.svg" alt="" width="40" height="40"/><div><b>11월 11일 · 기분 좋음</b><p>오늘 모둠 발표를 잘해서 칭찬받았다. 다음에는 더 크게 말해 봐야지.</p></div></div>
          <small className="ps-muted">🔒 나만 볼 수 있어요</small>
        </Frame>
      );
    case 'timer':
      return (
        <Frame title="수업 타이머">
          <div className="ps-timer"><b>04:59</b><span className="ps-ring"/><small>모둠 토의 시간</small></div>
        </Frame>
      );
    case 'random':
      return (
        <Frame title="발표자 뽑기">
          <div className="ps-random">{[0, 1, 2, 3, 4].map(i => <span key={i} className={i === 2 ? 'pick' : ''}><Avatar i={i}/>{kids[i].name}</span>)}</div>
        </Frame>
      );
    case 'chalkboard':
      return (
        <Frame title="칠판" tone="board">
          <div className="ps-chalk"><b>오늘의 목표</b><p>① 분수의 덧셈 이해하기<br/>② 모둠별 문제 만들기</p></div>
        </Frame>
      );
    case 'family-report':
      return (
        <Frame title="카드놀이 학습 소식 · 보호자용">
          <div className="ps-report"><div><b>과일 영어 세트</b><span>숙련도 86% · 필수 학습 완료</span></div><span className="ps-bar big"><span style={{width: '86%'}}/></span><p>“새 단어를 꾸준히 익히고 있어요. 집에서 3분만 함께 소리 내 읽어 주세요.”</p></div>
        </Frame>
      );
    case 'student-code':
      return (
        <Frame title="학생 입장 · 6자리 코드">
          <div className="ps-code">{'482913'.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="ps-btn">입장하기 →</div>
        </Frame>
      );
    case 'dashboard':
      return (
        <Frame title="선생님 홈 · 우리 반 현황">
          <div className="ps-dash">
            <div><small>함께하는 학생</small><b>24</b></div><div><small>확인할 숙제</small><b>7</b></div><div><small>검사 완료</small><b>42</b></div><div><small>우리 전시실</small><b>5</b></div>
          </div>
          <div className="ps-row"><span className="ps-dot due"/><b>과학 관찰 일지 마감 D-1</b></div>
        </Frame>
      );
    case 'lesson-review':
      return (
        <Frame title="수업 돌아보기">
          <div className="ps-scale">{['완전이해', '알쏭달쏭', '완전모름'].map((e, i) => <span key={e} className={i === 1 ? 'on' : ''}>{e}</span>)}</div>
          <div className="ps-reply"><b>쌍둥이 문제</b> 식물이 빛 쪽으로 휘어 자라는 까닭은? ① 물 ② 빛 ③ 바람</div>
        </Frame>
      );
    case 'speech':
      return (
        <Frame title="말하기 · 읽기 스튜디오">
          <div className="ps-wave">{Array.from({length: 28}, (_, i) => <i key={i} style={{height: `${20 + ((i * 37) % 60)}%`}}/>)}</div>
          <div className="ps-reply"><b>또박또박 읽기</b> “봄비가 촉촉이 내려요.” ● 녹음 중 0:07</div>
        </Frame>
      );
  }
}
