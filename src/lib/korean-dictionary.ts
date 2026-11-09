export type DictionaryEntry = {
  id: string;
  word: string;
  originalWord: string;
  partOfSpeech: string;
  definition: string;
  link: string;
};

export type DictionarySearchResult = {
  query: string;
  total: number;
  start: number;
  num: number;
  entries: DictionaryEntry[];
};

export const DICTIONARY_SUGGESTIONS = ['마음', '배려', '탐구', '윤슬', '함께'];

// Authored examples for the clearly labelled offline preview, not API responses.
// Official entries and definitions are loaded only through the authenticated route.
export const DICTIONARY_PREVIEW_ENTRIES: DictionaryEntry[] = [
  {id: 'preview-mind', word: '마음', originalWord: '', partOfSpeech: '명사', definition: '사람이 느끼거나 생각하는 안쪽의 움직임. 기쁨이나 슬픔을 느끼고, 무언가를 하기로 결심할 때에도 마음이라는 말을 써요.', link: 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=%EB%A7%88%EC%9D%8C'},
  {id: 'preview-kindness', word: '마음씨', originalWord: '', partOfSpeech: '명사', definition: '다른 사람이나 일을 대할 때 드러나는 마음의 바탕. 친구를 따뜻하게 대하는 모습을 보고 마음씨가 곱다고 말할 수 있어요.', link: 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=%EB%A7%88%EC%9D%8C%EC%94%A8'},
  {id: 'preview-wholehearted', word: '한마음', originalWord: '', partOfSpeech: '명사', definition: '여러 사람이 함께 품는 같은 생각이나 뜻. 함께 무언가를 이루고 싶을 때 한마음이 되었다고 말해요.', link: 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=%ED%95%9C%EB%A7%88%EC%9D%8C'},
  {id: 'preview-consideration', word: '배려', originalWord: '配慮', partOfSpeech: '명사', definition: '다른 사람의 처지와 마음을 생각하고 도와주거나 보살피는 것.', link: 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=%EB%B0%B0%EB%A0%A4'},
  {id: 'preview-inquiry', word: '탐구', originalWord: '探究', partOfSpeech: '명사', definition: '궁금한 것을 자세히 살피고 연구하여 알아가는 것.', link: 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=%ED%83%90%EA%B5%AC'},
  {id: 'preview-ripple', word: '윤슬', originalWord: '', partOfSpeech: '명사', definition: '햇빛이나 달빛을 받아 물결 위에서 반짝이는 빛.', link: 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=%EC%9C%A4%EC%8A%AC'},
  {id: 'preview-together', word: '함께', originalWord: '', partOfSpeech: '부사', definition: '여럿이 서로 어울려 같이. 친구와 같은 일을 할 때 쓸 수 있는 말이에요.', link: 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=%ED%95%A8%EA%BB%98'},
];
