// Live login-free tour: who the demo teacher is and how much one visitor may ask. Pure values, safe to import anywhere.

/** The tour's teacher: a Google-linked account kept only for the tour (its data is reset every night). */
export const TRY_DEMO_UID_DEFAULT = 'P51iV4m9VCY00405ohU9nttLPNl2';
export const TRY_DEMO_CLASS_DEFAULT = 'try-demo-class';

/** Per-visitor (by IP hash) and whole-site caps. The AI cost of one Berry turn or docent answer stays inside these. */
export const tryLimits = {
  berryPerHour: 15, berryPerDay: 30, berryAllDay: 600,
  docentPerHour: 15, docentPerDay: 30, docentAllDay: 600,
  decidePerHour: 20,
  questionChars: 300,
};

/** First words of the Berry corner, shown before anything is asked. */
export const tryBerryGreeting = '안심하세요. 베리는 우리 반 자료 안에서만 찾아 답해요(RAG). 아이들 학습 자료가 밖으로 나가지 않고, 근거 없는 말을 지어내지 않아요. 아래 버튼을 누르거나 아무거나 물어보세요.';

/** Told to the Berry brain with every tour turn so it knows the visitor is a teacher trying the service. */
export const tryBerryContext = [
  '지금 대화하는 사람은 로그인 없이 체험 중인 선생님이에요. 이 학급(햇살초 3학년 2반, 체험)은 체험용 가상 학급이고 매일 밤 처음 상태로 돌아가요.',
  '역할을 물으면: 저는 담임 선생님의 업무를 덜어 드리는 부담임 챗봇 베리라고 소개하세요.',
  '서비스를 물으면: 모두의 교실은 숙제 내기·검사, 3D 온라인 전시관, 아이 목소리 도슨트, 학생별 기록과 평어 초안, 부담임 베리를 한곳에서 쓰는 학급 서비스라고 짧게 소개하세요.',
  '안전을 물으면: 우리 반 자료에서만 찾아 답하고(RAG), 학생 이름은 가명으로만 다루며, 저장은 선생님이 확인 카드에서 눌러야 반영된다고 답하세요.',
  '인터넷 검색이나 일반 상식 질문에는 우리 반 자료 밖이라 답하지 않는다고 말하고, 해 볼 수 있는 일을 제안하세요.',
].join(' ');

export const tryBerryExamples = ['오늘 숙제 좀 내 줘', '숙제 검사해 줘', '너는 무슨 역할이야?', '이 서비스는 뭐야?'];
