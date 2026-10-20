/** Original pilot word lists, not a complete curriculum or textbook word list.
 * One explicit Korean meaning per prompt keeps the initial marking unambiguous. */
const lists = [
  'cat:고양이|dog:개|bird:새|fish:물고기|rabbit:토끼|bear:곰|lion:사자|tiger:호랑이|duck:오리|horse:말|red:빨간색|blue:파란색|green:초록색|yellow:노란색|black:검은색|white:흰색|pink:분홍색|orange:주황색|purple:보라색|brown:갈색|apple:사과|banana:바나나|grape:포도|peach:복숭아|melon:멜론|lemon:레몬|pear:배|cherry:체리|mango:망고|kiwi:키위',
  'head:머리|hand:손|foot:발|eye:눈|ear:귀|nose:코|mouth:입|arm:팔|leg:다리|finger:손가락|sun:태양|moon:달|star:별|sky:하늘|cloud:구름|rain:비|snow:눈(날씨)|wind:바람|tree:나무|flower:꽃|ball:공|doll:인형|kite:연|robot:로봇|bike:자전거|car:자동차|bus:버스|train:기차|boat:배(탈것)|plane:비행기',
  'school:학교|teacher:선생님|student:학생|classroom:교실|desk:책상|chair:의자|book:책|pencil:연필|eraser:지우개|bag:가방|family:가족|mother:어머니|father:아버지|sister:여자 형제|brother:남자 형제|baby:아기|friend:친구|name:이름|home:집|room:방|milk:우유|water:물|bread:빵|rice:밥|egg:달걀|cheese:치즈|juice:주스|soup:수프|cake:케이크|cookie:쿠키',
  'morning:아침|afternoon:오후|evening:저녁|night:밤|today:오늘|tomorrow:내일|yesterday:어제|week:주(시간)|month:달(기간)|year:년|spring:봄|summer:여름|autumn:가을|winter:겨울|weather:날씨|warm:따뜻한|cold:추운|hot:더운|cool:시원한|rainy:비가 오는|happy:행복한|sad:슬픈|angry:화가 난|tired:피곤한|hungry:배고픈|thirsty:목마른|kind:친절한|young:어린|small:작은|big:큰',
  'library:도서관|hospital:병원|museum:박물관|market:시장|station:역|park:공원|bridge:다리(구조물)|street:거리|village:마을|city:도시|mountain:산|river:강|ocean:대양|island:섬|forest:숲|beach:해변|lake:호수|desert:사막|field:들판|garden:정원|read:읽다|write:쓰다|listen:듣다|speak:말하다|learn:배우다|teach:가르치다|study:공부하다|draw:그리다|sing:노래하다|dance:춤추다',
  'travel:여행하다|visit:방문하다|arrive:도착하다|leave:떠나다|choose:선택하다|remember:기억하다|forget:잊다|understand:이해하다|practice:연습하다|finish:끝내다|healthy:건강한|careful:조심하는|important:중요한|different:다른|beautiful:아름다운|interesting:흥미로운|difficult:어려운|easy:쉬운|useful:유용한|special:특별한|future:미래|history:역사|science:과학|language:언어|culture:문화|nature:자연|planet:행성|energy:에너지|problem:문제|answer:정답',
];
export type QuizWord = {id: string; word: string; meaning: string};
export function quizVocabulary(grade: number): QuizWord[] {
  return lists[grade - 1].split('|').map(item => {const [word, meaning] = item.split(':'); return {id: `word-${word}`, word, meaning};});
}
