import {estimateLevel, sentences} from './scoring';

/** A book in the library: page texts for reading aloud, plus the PDF when there is one. */
export type BookPage = {text: string};
export type Book = {
  id: string; title: string; author: string; translator: string;
  /** Where the text came from and on what terms it may be used; required before saving. */
  source: string; license: BookLicense;
  level: number; pages: BookPage[]; createdAt: string;
  hasPdf: boolean; builtIn?: boolean;
};
export const bookLicenses = {
  'public-domain': '저작권 만료(원작·번역·그림 모두)',
  'open-license': '자유 이용 허락(CCL·공공누리 등)',
  'own-work': '교사·학생이 직접 만든 글',
  permitted: '저작권자에게 이용 허락을 받음',
} as const;
export type BookLicense = keyof typeof bookLicenses;
export const isBookLicense = (value: unknown): value is BookLicense => typeof value === 'string' && Object.hasOwn(bookLicenses, value);
export const BOOK_PAGE_MAX = 1200, BOOK_PAGES_MAX = 300, BOOK_PDF_MAX = 80 * 1024 * 1024;

export function bookLevel(pages: BookPage[]) {
  return estimateLevel(pages.map(p => p.text).join('\n').slice(0, 20000));
}
/** Splits pasted text into pages at blank lines, keeping each page short enough to read in one take. */
export function pagesFromText(text: string): BookPage[] {
  const pages: BookPage[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    let page = '';
    for (const sentence of sentences(block)) {
      if (page && page.length + sentence.length + 1 > 400) {pages.push({text: page}); page = '';}
      page = page ? `${page} ${sentence}` : sentence;
    }
    if (page) pages.push({text: page.slice(0, BOOK_PAGE_MAX)});
  }
  return pages.slice(0, BOOK_PAGES_MAX);
}
export const pageSentences = (page: BookPage | undefined) => page ? sentences(page.text) : [];

/**
 * Sample books retold for this app from traditional tales. The wording is our own, so the class can
 * start without uploading anything.
 */
const samples: {id: string; title: string; text: string}[] = [
  {id: 'sample-sun-moon', title: '해와 달이 된 오누이', text: `옛날 깊은 산골에 엄마와 오빠, 여동생이 살았어요. 엄마는 고개 너머 잔칫집에서 일을 하고 떡을 얻어 돌아오곤 했어요.

어느 날 저녁, 고개마다 호랑이가 나타났어요. "떡 하나 주면 안 잡아먹지." 엄마는 떡을 하나씩 주었지만, 떡이 다 떨어지자 호랑이는 엄마를 데려가 버렸어요.

호랑이는 엄마 옷을 입고 오누이 집 문을 두드렸어요. "얘들아, 엄마 왔다. 문 열어라." 문틈으로 보니 털이 숭숭 난 손이 보였어요. 오누이는 뒷문으로 빠져나가 우물가 나무 위로 올라갔어요.

호랑이가 쫓아오자 오누이는 하늘을 보며 빌었어요. "하늘님, 저희를 살리시려면 튼튼한 동아줄을 내려 주세요." 그러자 하늘에서 새 동아줄이 내려왔어요.

호랑이도 똑같이 빌었지만, 내려온 것은 썩은 동아줄이었어요. 줄이 끊어져 호랑이는 수수밭에 떨어졌어요. 하늘로 올라간 오빠는 달이 되고, 여동생은 해가 되어 지금도 세상을 밝게 비춘대요.`},
  {id: 'sample-hare-tortoise', title: '토끼와 거북이', text: `숲속에 발이 아주 빠른 토끼가 살았어요. 토끼는 늘 느릿느릿 걷는 거북이를 놀렸어요. "너는 언제 저 언덕까지 가니?"

거북이가 말했어요. "그럼 우리 언덕 꼭대기까지 달리기 시합을 해 볼까?" 토끼는 깔깔 웃으며 좋다고 했어요.

출발하자마자 토끼는 저만치 앞서 나갔어요. 뒤를 돌아보니 거북이는 아직 출발선 근처에 있었어요. "조금 자고 가도 내가 이기겠지." 토끼는 나무 그늘에서 잠이 들었어요.

거북이는 쉬지 않고 한 걸음, 또 한 걸음 걸었어요. 잠든 토끼를 지나 마침내 언덕 꼭대기에 닿았어요.

잠에서 깬 토끼는 깜짝 놀라 달려갔지만, 거북이가 이미 웃으며 기다리고 있었어요. 토끼는 처음으로 고개를 숙였어요. 꾸준히 걷는 걸음이 가장 멀리 간다는 걸 알게 되었거든요.`},
  {id: 'sample-golden-axe', title: '금도끼 은도끼', text: `옛날에 마음씨 착한 나무꾼이 살았어요. 나무꾼은 날마다 산에 가서 나무를 했어요.

어느 날 연못가에서 나무를 하다가 그만 도끼를 물에 빠뜨렸어요. "아이고, 하나뿐인 도끼인데 어쩌나." 나무꾼은 연못가에 앉아 엉엉 울었어요.

그때 연못에서 산신령이 나타났어요. 산신령은 반짝이는 금도끼를 들고 물었어요. "이 금도끼가 네 도끼냐?" 나무꾼은 고개를 저었어요. "아닙니다. 제 도끼는 낡은 쇠도끼입니다."

산신령은 은도끼도 보여 주었지만, 나무꾼은 이번에도 아니라고 했어요. 마지막으로 쇠도끼를 보여 주자 나무꾼은 활짝 웃었어요. "네, 그게 제 도끼예요!"

산신령은 정직한 나무꾼에게 금도끼와 은도끼까지 모두 선물로 주었어요. 나무꾼은 고맙다고 몇 번이나 절을 하고 집으로 돌아갔어요.`},
];
export const sampleBooks: Book[] = samples.map(sample => {
  const pages = pagesFromText(sample.text);
  return {id: sample.id, title: sample.title, author: '전래 이야기 · 모두의 교실 다시 씀', translator: '', source: '모두의 교실이 전래 이야기를 새로 쓴 글', license: 'own-work', level: bookLevel(pages), pages, createdAt: '2026-11-04T00:00:00.000Z', hasPdf: false, builtIn: true};
});
