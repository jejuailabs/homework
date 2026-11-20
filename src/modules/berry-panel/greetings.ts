/**
 * Berry's first hello of the day in the web panel. Written lines, no model call: instant and free.
 * The pool follows the Seoul clock (weekday, time of day, season); lines shown in the last RECENT_DAYS days are skipped
 * so a teacher does not read the same line twice in two weeks.
 */
export type Greeting = {id: string; text: string};
type Line = [id: string, text: string];

const WEEKDAY: Line[] = [
  ['wd1', '선생님, 좋은 아침이에요! 오늘도 아이들 웃음소리 가득한 하루 되세요.'],
  ['wd2', '안녕하세요, 선생님. 오늘 하루도 베리가 옆에서 든든하게 챙길게요.'],
  ['wd3', '좋은 아침이에요! 커피 한 잔 하시면서 천천히 시작해요.'],
  ['wd4', '선생님, 오늘도 출근하신 것만으로 이미 대단하세요.'],
  ['wd5', '안녕하세요! 오늘 교실에도 작은 반짝임이 많이 생기길 바라요.'],
  ['wd6', '좋은 아침이에요, 선생님. 바쁜 일은 베리한테 먼저 맡겨 주세요.'],
  ['wd7', '선생님, 어제보다 조금 더 가벼운 하루가 되길 응원해요.'],
  ['wd8', '오늘도 아이들에게 가장 좋은 어른이 되어 주실 선생님, 안녕하세요!'],
  ['wd9', '좋은 아침이에요! 오늘 챙길 일은 베리가 먼저 살펴볼게요.'],
  ['wd10', '선생님, 오늘도 무리하지 말고 한 걸음씩 가요. 베리가 같이 걸을게요.'],
  ['wd11', '안녕하세요, 선생님. 오늘의 첫 할 일은 숨 한 번 크게 쉬기예요.'],
  ['wd12', '좋은 아침이에요! 오늘 수업이 술술 풀리길 베리가 응원할게요.'],
  ['wd13', '선생님, 아침 공기가 상쾌하죠? 오늘도 좋은 일만 가득하길 바라요.'],
  ['wd14', '안녕하세요! 오늘은 어떤 이야기로 교실을 채우실지 궁금해요.'],
  ['wd15', '선생님, 오늘도 와 주셔서 반가워요. 필요한 건 편하게 말씀해 주세요.'],
  ['wd16', '좋은 아침이에요. 복잡한 건 베리가 정리할 테니 선생님은 아이들만 봐 주세요.'],
];
const MONDAY: Line[] = [
  ['mo1', '선생님, 새로운 한 주가 시작됐어요! 이번 주도 베리가 함께할게요.'],
  ['mo2', '월요일 아침이에요. 천천히, 무리하지 말고 시작해요, 선생님.'],
  ['mo3', '한 주의 첫날이에요. 이번 주 할 일은 베리가 차근차근 정리해 둘게요.'],
  ['mo4', '좋은 월요일이에요! 주말 동안 충전하신 힘으로 가볍게 출발해요.'],
  ['mo5', '선생님, 월요일은 원래 조금 무거워요. 오늘은 베리가 더 많이 도울게요.'],
  ['mo6', '새 주의 시작이에요. 이번 주도 아이들과 좋은 추억 많이 만드세요!'],
];
const FRIDAY: Line[] = [
  ['fr1', '선생님, 드디어 금요일이에요! 한 주 정말 고생 많으셨어요.'],
  ['fr2', '금요일 아침이에요. 오늘만 힘내면 주말이에요, 선생님!'],
  ['fr3', '이번 주도 아이들 곁을 지켜 주셔서 고마워요. 마지막 날도 응원해요!'],
  ['fr4', '금요일이에요! 이번 주 마무리는 베리가 같이 챙길게요.'],
  ['fr5', '한 주 동안 정말 애쓰셨어요. 오늘은 조금 더 가볍게 보내요, 선생님.'],
  ['fr6', '선생님, 불금이에요! 오늘 할 일만 끝내고 푹 쉬세요.'],
];
const AFTERNOON: Line[] = [
  ['af1', '선생님, 오후도 힘내세요! 남은 일은 베리가 같이 볼게요.'],
  ['af2', '안녕하세요, 선생님. 오전 수업 정말 수고 많으셨어요.'],
  ['af3', '점심은 잘 챙겨 드셨어요? 오후도 베리가 옆에 있을게요.'],
  ['af4', '오후가 되니 조금 지치시죠? 남은 건 베리랑 나눠서 해요.'],
  ['af5', '선생님, 오늘 절반을 해내셨어요! 나머지도 차근차근 같이 가요.'],
  ['af6', '안녕하세요! 오후엔 정리할 일이 많죠. 베리가 먼저 살펴볼게요.'],
  ['af7', '선생님, 따뜻한 차 한 잔 어떠세요? 오후도 응원해요.'],
];
const EVENING: Line[] = [
  ['ev1', '선생님, 아직 일하고 계셨군요. 오늘 정말 수고 많으셨어요.'],
  ['ev2', '늦은 시간까지 고생 많으세요. 남은 건 내일의 베리에게 맡겨도 돼요.'],
  ['ev3', '오늘 하루도 정말 애쓰셨어요, 선생님. 꼭 쉬어 가세요.'],
  ['ev4', '선생님, 오늘도 아이들 곁에서 고생 많으셨어요. 급한 것만 같이 봐요.'],
  ['ev5', '저녁까지 챙기시느라 바쁘셨죠? 짧게 끝내고 편히 쉬세요.'],
  ['ev6', '오늘 하루 정말 잘 해내셨어요. 남은 일은 베리가 정리해 둘게요.'],
];
const WEEKEND: Line[] = [
  ['we1', '주말에도 들러 주셨네요! 오늘은 꼭 쉬어 가세요, 선생님.'],
  ['we2', '선생님, 편안한 주말 보내고 계신가요? 급한 것만 같이 봐요.'],
  ['we3', '주말엔 선생님도 충전하는 날이에요. 베리가 짧게 도울게요.'],
  ['we4', '주말에도 아이들 생각하시는 선생님, 정말 멋지세요. 오늘은 쉬엄쉬엄 해요.'],
  ['we5', '선생님, 주말이에요! 다음 주 준비는 베리가 가볍게 거들게요.'],
  ['we6', '쉬는 날에도 와 주셔서 반가워요. 오래 붙잡지 않을게요!'],
];
const WINTER: Line[] = [
  ['wi1', '날이 많이 추워졌어요. 따뜻하게 입고 출근하셨죠, 선생님?'],
  ['wi2', '손이 시린 아침이에요. 따뜻한 차 한 잔으로 시작해요!'],
  ['wi3', '감기 조심하세요, 선생님. 아이들도 선생님도 건강한 하루 되길 바라요.'],
  ['wi4', '겨울 아침이라 일어나기 힘드셨죠? 오늘도 와 주셔서 고마워요.'],
];
const YEAR_END: Line[] = [
  ['ye1', '한 해가 저물어 가요. 올해도 아이들과 정말 많은 걸 해내셨어요.'],
  ['ye2', '학기 마무리로 바쁜 때죠. 정리할 건 베리가 같이 챙길게요.'],
  ['ye3', '올해도 얼마 안 남았어요. 남은 날들도 베리가 곁에서 도울게요.'],
];
const SPRING: Line[] = [
  ['sp1', '새 학기의 설렘이 느껴지는 아침이에요. 오늘도 응원해요, 선생님!'],
  ['sp2', '봄 햇살 같은 하루 되세요, 선생님. 새 친구들과 즐거운 시간 보내요.'],
];
const PLAYFUL: Line[] = [
  ['pl1', '선생님, 오늘 베리는 기운이 넘쳐요. 일 많이 주셔도 돼요!'],
  ['pl2', '좋은 아침이에요! 오늘의 베리 컨디션은 100%예요.'],
  ['pl3', '안녕하세요! 오늘도 선생님 팬 1호 베리가 왔어요.'],
  ['pl4', '선생님의 하루가 맑음이길, 베리가 미리 빌어 둘게요.'],
  ['pl5', '베리 출근 완료! 선생님, 오늘 뭐부터 도와드릴까요?'],
  ['pl6', '똑똑, 베리예요! 오늘도 선생님 옆자리 예약했어요.'],
];
const CLASSROOM: Line[] = [
  ['cl1', '오늘도 아이들이 선생님 덕분에 한 뼘 자랄 거예요.'],
  ['cl2', '선생님이 계셔서 교실이 따뜻해요. 오늘도 응원해요!'],
  ['cl3', '아이들 이름 하나하나 기억하시는 선생님, 정말 멋져요.'],
  ['cl4', '선생님의 한마디가 어떤 아이에겐 오늘 하루 전부일지도 몰라요. 오늘도 응원해요.'],
  ['cl5', '오늘 교실에서 피어날 작은 성장들, 베리도 기대돼요.'],
];
const PLAIN: Line[] = [
  ['pn1', '안녕하세요, 선생님. 오늘도 함께해요.'],
  ['pn2', '좋은 아침이에요. 오늘 하루도 응원해요.'],
  ['pn3', '선생님, 오늘도 베리가 곁에 있을게요.'],
  ['pn4', '안녕하세요! 편하게 말씀만 해 주세요.'],
];

export const GREETING_COUNT = [WEEKDAY, MONDAY, FRIDAY, AFTERNOON, EVENING, WEEKEND, WINTER, YEAR_END, SPRING, PLAYFUL, CLASSROOM, PLAIN].reduce((sum, lines) => sum + lines.length, 0);
export const RECENT_DAYS = 14;

/** Seoul calendar fields for a moment; the computer's own clock zone is ignored. */
export function seoul(now: number) {
  const d = new Date(now + 9 * 3_600_000);
  return {date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay(), month: d.getUTCMonth() + 1};
}

/** The lines that fit this moment: time of day first, then the day of the week and the season. */
export function greetingPool(now: number): Line[] {
  const {minute, weekday, month} = seoul(now);
  if (weekday === 0 || weekday === 6) return WEEKEND;
  if (minute >= 18 * 60) return EVENING;
  if (minute >= 12 * 60) return AFTERNOON;
  const season = month === 12 ? [...WINTER, ...YEAR_END] : month <= 2 || month === 11 ? WINTER : month === 3 ? SPRING : [];
  const day = weekday === 1 ? MONDAY : weekday === 5 ? FRIDAY : [];
  // The weekday's own lines count twice so Mondays and Fridays usually sound like it.
  return [...day, ...day, ...WEEKDAY, ...season, ...PLAYFUL, ...CLASSROOM, ...PLAIN];
}

export type GreetingHistory = {date: string; id: string}[];
/** One line for this moment, skipping lines shown in the last RECENT_DAYS days; random picks use the given 0–1 value. */
export function pickGreeting(now: number, history: GreetingHistory, random = Math.random()): Greeting {
  const pool = greetingPool(now), today = seoul(now).date;
  const since = seoul(now - RECENT_DAYS * 86_400_000).date;
  const recent = new Set(history.filter(entry => entry.date > since && entry.date <= today).map(entry => entry.id));
  const fresh = pool.filter(([id]) => !recent.has(id));
  const choices = fresh.length ? fresh : pool;
  const [id, text] = choices[Math.min(choices.length - 1, Math.floor(random * choices.length))];
  return {id, text};
}
/** History kept on this device: the last few weeks only. */
export function remember(history: GreetingHistory, date: string, id: string): GreetingHistory {
  return [...history.filter(entry => entry.date !== date), {date, id}].slice(-RECENT_DAYS * 2);
}
