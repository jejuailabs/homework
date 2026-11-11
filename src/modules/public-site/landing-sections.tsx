import Link from 'next/link';
import JsonLd from './json-ld';
import VisualBlock from './visual';
import {GUIDES, guideBySlug} from './guides';
import {SITE_ALT_NAMES, SITE_NAME, SITE_ONE_LINER, SITE_URL, categoryName} from './site';
import type {Visual} from './types';
import './public-site.css';

// Public introduction shown below the sign-in screen. Server-rendered so
// search engines and AI crawlers read every word without running scripts.

type Feature = {tag: string; title: string; text: string; points: string[]; visual: Visual; guide: string; more: string};

const FEATURES: Feature[] = [
  {
    tag: '숙제 · 과제', title: '온라인 숙제, 내고 받고 검사하기까지 한 화면에서',
    text: '과제 제목과 할 일, 마감 시간을 적고 제출 방식을 고르면 반 전체에 숙제가 나갑니다. 학생은 휴대폰으로 글·사진·영상·녹음을 올리고, 선생님은 한 명씩 넘겨 보며 바로 “선생님 말씀”을 남깁니다.',
    points: ['제출 방식 4가지: 텍스트 작성, 이미지 업로드, 영상 업로드(최대 3분), 녹음', '“참 잘했어요 · 검사 완료”와 “다시 제출 요청”, 여러 명 일괄 검사', '숙제 파일을 학생 번호·이름이 붙은 ZIP으로 한 번에 받기'],
    visual: {mock: 'homework-review', alt: '모두의 교실 숙제 검사 화면 예시: 학생 제출물을 한 명씩 확인하고 선생님 말씀을 남기는 모습'},
    guide: 'online-homework-create', more: '온라인 숙제 내는 방법 보기',
  },
  {
    tag: '전시실', title: '아이들 작품이 걸리는 우리 반 3D 전시관',
    text: '작품 사진을 올리면 액자에 걸린 3D 전시실이 만들어집니다. 아이들은 전시관을 걸어 다니며 친구 작품을 감상하고, 선생님이 QR을 켜면 보호자도 로그인 없이 관람할 수 있습니다.',
    points: ['사진 25장을 한 번에 올리고 작가(학생)와 연결', '숙제의 사진·영상 제출물을 전시실에 자동으로 걸기', '아이 목소리 도슨트, 따뜻한 방명록, 디지털 아트북 PDF'],
    visual: {mock: 'exhibition-wall', alt: '학급 작품 전시실 예시: 액자에 걸린 학생 그림 작품들'},
    guide: 'online-art-exhibition', more: '온라인 작품 전시회 여는 법 보기',
  },
  {
    tag: 'AI 비서 베리', title: '“안 낸 학생 알려 줘” 말하면 정리해 주는 교사용 AI 비서',
    text: '베리는 선생님만 쓰는 AI 업무 비서입니다. 미제출 학생, 검사 대기, 전시 승인 대기를 말로 물으면 바로 답하고, 숙제 내기나 투표 만들기 같은 일도 대신 준비합니다.',
    points: ['저장 전에 항상 확인 카드를 보여 주고, 선생님이 눌러야 반영', '학생 이름은 “학생 07”처럼 가명으로만 다룸', 'Claude·ChatGPT에 연결해 그곳에서도 우리 반 업무 처리'],
    visual: {mock: 'berry-chat', alt: '교사용 AI 비서 베리와 미제출 학생을 묻는 대화 예시'},
    guide: 'berry-ai-assistant', more: 'AI 비서 베리 자세히 보기',
  },
  {
    tag: '수업 활동', title: '참여보드 · 학급 투표 · 함께캔버스로 모두가 참여하는 수업',
    text: '포스트잇처럼 생각을 붙이는 참여보드, 결과가 바로 보이는 학급 투표, 모둠이 함께 그리는 함께캔버스로 발표가 어려운 아이도 수업에 들어옵니다.',
    points: ['보드 배치 9가지: 벽, 열, 격자, 표, 자유, 타임라인, 지도 등', '글·사진·영상·음성·링크·그림 올리기, 댓글과 반응', '“누구나 구경” 읽기 전용 링크로 보호자와 공유'],
    visual: {mock: 'board', alt: '참여보드 예시: 학생들이 오늘 배운 점을 포스트잇으로 붙인 학급 게시판'},
    guide: 'participation-board', more: '참여보드 사용법 보기',
  },
  {
    tag: '단어 카드 · 복습', title: '단어 카드와 AI 복습 문제로 배운 것을 오래 기억하게',
    text: '카드놀이로 단어·문장 카드를 만들어 반에 나눠 주면 학생은 암기·스펠·테스트와 짝 맞추기 게임으로 익힙니다. 복습하기는 수업 자료로 개념 카드와 쌍둥이 문제를 만들어 7일·14일 뒤 다시 풀게 합니다.',
    points: ['CSV로 카드 세트 가져오기, 원어민 읽어주기 음성', '짝 맞추기·단어 비·문장 퍼즐, 카드 팀전', '“완전이해·알쏭달쏭·완전모름” 자기 점검 뒤 다시 풀기'],
    visual: {mock: 'cards', alt: '영어 단어 카드 학습 예시: 그림과 뜻, 읽어주기 버튼이 있는 카드'},
    guide: 'word-cards', more: '단어 카드 학습 보기',
  },
  {
    tag: '학급 경영', title: '보말 포인트와 나의 작은 세상, 매일 오고 싶은 교실',
    text: '선생님이 칭찬과 함께 학급 포인트 “보말”을 주면 아이들은 작은 상점에서 캐릭터 소품을 사고 방을 꾸밉니다. 숙제를 마칠수록 동물 친구가 자라고, 비밀일기장에는 잠금이 걸린 나만의 일기를 씁니다.',
    points: ['사유가 남는 보말 지급·회수, 하루 한도', '펫 키우기, 옷 입히기, 방 테마 10종', '6자리 잠금과 암호화로 보호되는 비밀일기장'],
    visual: {mock: 'my-space', alt: '나의 작은 세상 예시: 노을 창이 있는 방과 고양이 캐릭터'},
    guide: 'my-little-world', more: '나의 작은 세상 보기',
  },
  {
    tag: '교사 도구', title: '타이머부터 국어사전까지, 수업 도구 39가지',
    text: '타이머, 랜덤 뽑기, 돌림판, 자리·모둠, 판서, QR 코드, 국어사전, 말하기·읽기 스튜디오까지 수업 중 필요한 도구를 검색하고 여러 창으로 동시에 띄웁니다.',
    points: ['시간·집중, 뽑기·모둠, 판서·자료, 놀이 등 6개 분류', 'AI 도구함: 수업자료, 가정통신문, 피드백, 상담 준비 초안', '손글씨 사진을 글로 옮기는 사진 글 정리'],
    visual: {mock: 'random', alt: '수업 도구 예시: 발표자를 무작위로 뽑는 랜덤 뽑기 화면'},
    guide: 'classroom-tools', more: '수업 도구 전체 보기',
  },
  {
    tag: '가정 연계', title: '보호자와는 로그인 없이, 꼭 필요한 만큼만',
    text: '보호자에게 따로 가입을 받지 않습니다. 선생님이 켠 전시실 QR, 참여보드 구경 링크, 카드 학습 소식 링크로 아이의 배움을 보여 주고, 링크는 언제든 끄거나 새로 만들 수 있습니다.',
    points: ['전시실 QR 관람과 방명록', '학생별 카드 학습 소식(만료일 있는 링크)', '디지털 아트북 PDF, AI 가정통신문 초안'],
    visual: {mock: 'family-report', alt: '보호자용 카드 학습 소식 예시: 숙련도와 필수 학습 현황'},
    guide: 'parent-communication', more: '가정 연계 방법 보기',
  },
];

const STEPS = [
  {t: 'Google로 시작', d: '선생님은 Google 계정으로 로그인합니다. 별도 회원가입 양식이 없습니다.'},
  {t: '학생 명단 붙여넣기', d: '“1. 김민서”처럼 붙여넣거나 엑셀에서 복사하면 6자리 입장 코드가 만들어집니다.'},
  {t: '코드 나눠 주기', d: '학생은 “학생 입장”에 숫자 6자리만 넣으면 우리 반에 들어옵니다.'},
  {t: '첫 숙제 내기', d: '제출 방식을 고르고 “과제 나누기”. 제출물은 전시실·참여보드에 자동으로 걸 수 있습니다.'},
];

const FAQ = [
  {q: '모두의 교실(ourclass)은 어떤 서비스인가요?', a: SITE_ONE_LINER},
  {q: '교실.com과 ourclass.co.kr은 같은 곳인가요?', a: '네. 교실.com으로 들어오면 ourclass.co.kr로 연결됩니다. 어느 주소로 들어와도 같은 모두의 교실입니다.'},
  {q: '학생은 어떻게 로그인하나요?', a: '첫 화면에서 “학생 입장”을 누르고 선생님이 나눠 준 숫자 6자리 입장 코드를 입력합니다. 학생은 이메일이나 비밀번호가 필요 없고, 코드를 잃어버리면 선생님이 다시 발급합니다.'},
  {q: '선생님은 어떻게 시작하나요?', a: '“선생님 · 운영자 로그인”에서 Google 계정으로 로그인합니다. 카카오톡·네이버 앱 안에서 열었다면 안내에 따라 일반 브라우저로 열어 주세요.'},
  {q: '보호자도 가입해야 하나요?', a: '아니요. 보호자 계정은 없습니다. 선생님이 켠 전시실 QR이나 공유 링크로 로그인 없이 볼 수 있고, 공유를 끄면 바로 볼 수 없게 됩니다.'},
  {q: 'AI 비서 베리가 학생 정보를 함부로 바꾸지 않나요?', a: '베리는 무엇을 저장하든 먼저 확인 카드를 보여 주고, 선생님이 [저장]을 눌러야 반영합니다. 학생 이름은 가명으로 다루고 일기 본문이나 사진·영상 원본은 보지 않습니다.'},
  {q: '휴대폰에서도 쓸 수 있나요?', a: '네. 휴대폰·태블릿·PC 브라우저에서 모두 쓸 수 있고, 홈 화면에 바로가기를 만들면 앱처럼 열 수 있습니다.'},
  {q: '학생 사진과 작품은 안전하게 보관되나요?', a: '파일은 비공개로 저장되어 잠시만 유효한 주소로만 열리고, 관람용 사진은 위치 정보를 지웁니다. 공유 페이지는 검색에 노출되지 않으며 데이터는 서울 리전에 보관됩니다.'},
];

const FEATURED = ['what-is-ourclass', 'teacher-getting-started', 'homework-check-feedback', 'berry-commands', 'parent-qr-gallery', 'ai-classroom-guide'];

function landingJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type': 'Organization', '@id': `${SITE_URL}/#org`, name: SITE_NAME, alternateName: SITE_ALT_NAMES, url: SITE_URL, logo: `${SITE_URL}/icons/app-512.png`},
      {'@type': 'WebSite', '@id': `${SITE_URL}/#site`, name: SITE_NAME, alternateName: SITE_ALT_NAMES, url: SITE_URL, inLanguage: 'ko-KR', publisher: {'@id': `${SITE_URL}/#org`}},
      {
        '@type': 'WebApplication', name: SITE_NAME, alternateName: SITE_ALT_NAMES, url: SITE_URL, description: SITE_ONE_LINER,
        applicationCategory: 'EducationalApplication', operatingSystem: 'Web, iOS, Android, Windows, macOS', inLanguage: 'ko-KR',
        audience: {'@type': 'EducationalAudience', educationalRole: 'teacher'},
        featureList: FEATURES.map(f => f.title),
      },
      {'@type': 'FAQPage', mainEntity: FAQ.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}}))},
    ],
  };
}

export default function LandingSections() {
  const featured = FEATURED.map(guideBySlug).filter(g => g !== undefined);
  return (
    <div className="ps">
      <JsonLd data={landingJsonLd()}/>
      <div className="ps-scroll-hint"><a href="#about">모두의 교실 둘러보기 ↓</a></div>

      <section id="about" className="ps-section" aria-labelledby="about-title">
        <div className="ps-wrap ps-intro">
          <div>
            <p className="ps-kicker">About · ourclass</p>
            <h2 id="about-title" className="ps-title">모두의 교실은 어떤 곳인가요?</h2>
            <p className="ps-define">{SITE_ONE_LINER}</p>
            <div className="ps-pills" aria-label="다른 이름">{[SITE_NAME, ...SITE_ALT_NAMES].map(n => <span key={n}>{n}</span>)}</div>
            <div className="ps-stats">
              <div><b>4가지</b><small>숙제 제출 방식</small></div>
              <div><b>39개</b><small>수업 도구</small></div>
              <div><b>6자리</b><small>학생 입장 코드</small></div>
            </div>
          </div>
          <VisualBlock visual={{mock: 'dashboard', alt: '모두의 교실 선생님 홈 화면 예시: 함께하는 학생, 확인할 숙제, 검사 완료, 우리 전시실 현황'}}/>
        </div>
      </section>

      <section className="ps-section alt" aria-labelledby="features-title">
        <div className="ps-wrap">
          <p className="ps-kicker">Features</p>
          <h2 id="features-title" className="ps-title">숙제 · 전시 · AI · 수업 활동을 한곳에서</h2>
          <p className="ps-lead">여러 앱을 오가며 링크를 나눠 주던 일을 하나의 학급 공간으로 모았습니다. 숙제 제출물이 전시실과 참여보드로 이어지고, AI 비서 베리가 그 흐름을 함께 챙깁니다.</p>
          {FEATURES.map((f, i) => (
            <article key={f.tag} className={`ps-feature ${i % 2 ? 'flip' : ''}`}>
              <div className="ps-feature-text">
                <span className="ps-tag">{f.tag}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <ul>{f.points.map(p => <li key={p}>{p}</li>)}</ul>
                <Link className="ps-more" href={`/guide/${f.guide}`}>{f.more} →</Link>
              </div>
              <VisualBlock visual={f.visual}/>
            </article>
          ))}
        </div>
      </section>

      <section className="ps-section" aria-labelledby="start-title">
        <div className="ps-wrap">
          <p className="ps-kicker">Getting started</p>
          <h2 id="start-title" className="ps-title">10분이면 우리 반이 열립니다</h2>
          <p className="ps-lead">학생은 이메일도 비밀번호도 필요 없습니다. 선생님이 명단을 붙여넣으면 학생마다 숫자 6자리 입장 코드가 만들어집니다.</p>
          <ol className="ps-steps">{STEPS.map(s => <li key={s.t}><b>{s.t}</b>{s.d}</li>)}</ol>
        </div>
      </section>

      <section className="ps-section alt" aria-labelledby="who-title">
        <div className="ps-wrap">
          <p className="ps-kicker">For everyone</p>
          <h2 id="who-title" className="ps-title">선생님, 학생, 보호자 모두를 위한 교실</h2>
          <div className="ps-cardgrid">
            <div className="ps-card"><small>선생님</small><b>업무는 줄이고 수업에 집중</b><p>숙제 검사, 작품 정리, 공지, 기록을 한곳에서. 반복되는 확인은 베리에게 맡깁니다.</p></div>
            <div className="ps-card"><small>학생</small><b>사진 찍고, 제출하면 끝</b><p>오늘 할 숙제를 찾고 선생님 말씀을 받습니다. 동물 친구를 키우며 하루하루 자랍니다.</p></div>
            <div className="ps-card"><small>보호자</small><b>가입 없이 아이의 배움 보기</b><p>선생님이 보낸 QR과 링크로 전시 작품과 학습 소식을 확인합니다.</p></div>
          </div>
        </div>
      </section>

      <section className="ps-section" aria-labelledby="safe-title">
        <div className="ps-wrap">
          <p className="ps-kicker">Privacy & safety</p>
          <h2 id="safe-title" className="ps-title">학생 정보는 교실 안에서만</h2>
          <div className="ps-tablewrap">
            <table className="ps-compare">
              <thead><tr><th>걱정되는 점</th><th>모두의 교실의 방식</th></tr></thead>
              <tbody>
                <tr><td>학생 사진·영상 유출</td><td>비공개 저장, 잠시만 유효한 주소로만 열람. 관람용 사진은 위치 정보(EXIF) 제거</td></tr>
                <tr><td>공유 링크가 퍼지는 일</td><td>선생님이 언제든 끄거나 새 링크로 교체. 공유 페이지는 검색에 노출되지 않음</td></tr>
                <tr><td>AI가 학생 정보를 다루는 일</td><td>베리는 가명만 사용, 일기·원본 파일·민감 기록 제외, 저장 전 선생님 확인</td></tr>
                <tr><td>학생 글에 개인 연락처</td><td>자유 글은 선생님 승인 뒤 공개, 연락처·링크는 걸러냄</td></tr>
                <tr><td>데이터 보관 위치</td><td>서울 리전에 저장. 일기와 교무수첩은 암호화</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{marginTop: 16}}><Link className="ps-more" href="/guide/student-privacy">학생 개인정보 보호 설계 자세히 보기 →</Link></p>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="ps-section alt" aria-labelledby="guide-title">
          <div className="ps-wrap">
            <p className="ps-kicker">Guide</p>
            <h2 id="guide-title" className="ps-title">모두의 교실 사용 가이드</h2>
            <p className="ps-lead">처음 시작하는 법부터 AI 교실 운영 노하우까지 {GUIDES.length}편의 글로 정리했습니다.</p>
            <div className="ps-cardgrid">
              {featured.map(g => (
                <Link key={g.slug} className="ps-card" href={`/guide/${g.slug}`}><small>{categoryName(g.category)}</small><b>{g.title}</b><p>{g.description}</p></Link>
              ))}
            </div>
            <p style={{marginTop: 20}}><Link className="ps-more" href="/guide">사용 가이드 전체 보기 →</Link></p>
          </div>
        </section>
      )}

      <section className="ps-section" aria-labelledby="faq-title">
        <div className="ps-wrap">
          <p className="ps-kicker">FAQ</p>
          <h2 id="faq-title" className="ps-title">자주 묻는 질문</h2>
          <div className="ps-faq">{FAQ.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
        </div>
      </section>

      <section className="ps-section alt ps-cta" aria-labelledby="cta-title">
        <div className="ps-wrap">
          <h2 id="cta-title" className="ps-title">오늘, 우리 반 교실을 열어 보세요</h2>
          <p className="ps-lead" style={{margin: '0 auto 10px'}}>선생님은 Google 계정으로, 학생은 6자리 코드로 바로 들어옵니다.</p>
          <a className="button primary" href="#main">로그인하러 가기 ↑</a>
          <Link className="button" href="/guide">사용 가이드 보기</Link>
        </div>
      </section>

      <footer className="ps-wrap ps-foot">
        <nav aria-label="가이드 바로가기">
          {FEATURES.map(f => <Link key={f.guide} href={`/guide/${f.guide}`}>{f.tag}</Link>)}
          <Link href="/guide">전체 가이드</Link>
        </nav>
        <p>{SITE_NAME} (Our Classroom · ourclass.co.kr · 교실.com) — 작은 도전, 함께 자라는 하루.</p>
      </footer>
    </div>
  );
}
