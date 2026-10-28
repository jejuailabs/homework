import {newPet} from './new-pets';

export const personalities: Record<string, {
    name: string;
    en: string;
    trait: string;
    hello: string[];
    cheer: string;
    rest: string;
}> = {
    cat: { name: '모찌', en: 'Mochi', trait: '작은 발견을 좋아하는 호기심쟁이', hello: ['오늘은 어떤 작은 발견을 할까?', '네가 오니까 내 하루가 말랑해졌어!', '창가에 햇살 한 조각 남겨 뒀어.'], cheer: '네가 해낸 걸 나도 봤어. 정말 멋져!', rest: '천천히 쉬어 가도 괜찮아. 같이 있을게.' },
    dog: { name: '두부', en: 'Dubu', trait: '응원을 아끼지 않는 다정한 친구', hello: ['오늘도 네 편이야! 같이 해 보자.', '꼬리가 먼저 인사하고 있네!', '네 이야기를 기다리고 있었어.'], cheer: '해냈다! 우리 하이파이브!', rest: '잠깐 기지개 켜자. 나도 쉬는 중이야.' },
    rabbit: { name: '토리', en: 'Tori', trait: '이야기를 모으는 상상력 친구', hello: ['상상 한 스푼, 오늘은 뭘 만들어 볼까?', '네 노트에 어떤 이야기가 피어날까?', '구름이 당근 모양이었어. 너도 봤어?'], cheer: '네 생각이 반짝이는 순간이야!', rest: '새로운 생각은 쉬는 시간에도 자란대.' },
    hamster: { name: '콩이', en: 'Kong', trait: '작은 성취를 차곡차곡 모으는 친구', hello: ['작은 한 걸음도 소중하니까!', '오늘의 보물 주머니를 열어 볼까?', '조금씩 모으면 멋진 이야기가 돼.'], cheer: '차곡차곡, 오늘도 하나 해냈네!', rest: '볼주머니도 마음도 잠깐 비우고 쉬자.' },
    alpaca: { name: '구름이', en: 'Cloud', trait: '느긋하게 기다려 주는 포근한 친구', hello: ['서두르지 않아도 돼. 네 속도로 가자.', '포근한 구름 자리 하나 비워 뒀어.', '오늘 네 기분은 어떤 색이야?'], cheer: '네 속도로 해낸 오늘이 참 멋져.', rest: '푹신한 구름처럼 잠깐 쉬어도 좋아.' },
    otter: { name: '모아', en: 'Moa', trait: '그림과 꾸미기를 좋아하는 꼬마 예술가', hello: ['마음에 드는 색 하나 골라 볼래?', '우리 방에 네 취향을 한 조각 더하자.', '작은 조개 하나에 네 이야기를 담아 봐.'], cheer: '네 정성이 작품처럼 반짝여!', rest: '마음에도 여백을 남겨 두자.' },
};
export const friendBase = (pet: string) => newPet(pet)?.base || (pet.startsWith('cat-') ? 'cat' : pet.replace('friend-', ''));
const breedPersonalities: Record<string, (typeof personalities)[string]> = {
    'animal-whiteknee': {name: '화이트니', en: 'Whiteknee', trait: '작은 발걸음으로 용기를 전하는 보송보송한 친구', hello: ['오늘은 어떤 작은 모험을 떠나 볼까?', '보송보송한 응원, 네 곁에 놓고 갈게!', '네가 오니까 반가워서 발이 들썩여!'], cheer: '한 걸음씩 해낸 너, 정말 멋져!', rest: '발을 내려놓고, 우리 잠깐 쉬어 가자.'},
    'cat-american': { name: '줄이', en: 'Juli', trait: '줄무늬 주머니에 발견을 모으는 탐험가', hello: ['오늘의 발견 지도에 무엇을 그릴까?', '작은 발자국도 멋진 모험의 시작이야.', '네가 찾은 보물을 내게도 보여 줘!'], cheer: '모험 지도에 반짝이는 발자국이 늘었네!', rest: '탐험가에게도 햇살 낮잠이 필요해.' },
    'cat-british': { name: '포포', en: 'Popo', trait: '기다려 주는 마음이 폭신한 낮잠 친구', hello: ['폭신한 자리 하나, 네 옆에 남겨 뒀어.', '네가 오니까 내 하루가 말랑해졌어!', '급하지 않아. 네 이야기를 천천히 들려줘.'], cheer: '차근차근 해낸 네 마음을 안아 주고 싶어.', rest: '잠깐 쉬어도 괜찮아. 포근한 자리에서 기다릴게.' },
    'cat-siamese': { name: '코코', en: 'Coco', trait: '궁금한 것이 많은 재잘재잘 이야기꾼', hello: ['있잖아, 오늘 제일 궁금한 건 뭐야?', '네가 만든 이야기에 다음 장이 궁금해!', '창밖 구름은 어디로 여행을 갈까?'], cheer: '와, 그 다음 이야기도 정말 기대돼!', rest: '오늘 이야기는 잠깐 책갈피를 꽂아 두자.' },
    'cat-persian': { name: '솜이', en: 'Somi', trait: '조용한 책장 옆에서 생각을 키우는 친구', hello: ['포근한 이야기 한 장, 같이 펼칠까?', '마음에 남은 말 하나를 노트에 적어 봐.', '고요한 시간에도 생각은 자라고 있어.'], cheer: '네 정성이 책 한 권처럼 쌓이고 있어.', rest: '잠깐 눈을 감고 마음에 여백을 주자.' },
    'cat-ragdoll': { name: '라라', en: 'Lala', trait: '작은 기쁨을 함께 나누는 다정한 친구', hello: ['오늘 네가 웃었던 순간을 들려줄래?', '작은 꽃 한 송이도 함께 보면 더 예뻐.', '좋아하는 색으로 오늘을 꾸며 보자.'], cheer: '네 기쁨이 내 마음에도 꽃처럼 피었어!', rest: '아무것도 하지 않아도 우리는 친구야.' },
    'cat-maine': { name: '솔이', en: 'Soli', trait: '숲속의 용기를 모으는 든든한 친구', hello: ['커다란 나무도 작은 새싹에서 시작한대.', '오늘의 용기를 작은 잎에 담아 보자.', '낯선 일도 한 발씩 함께 가면 괜찮아.'], cheer: '도전한 네 마음이 큰 나무처럼 자랐네!', rest: '나무 그늘에서 숨을 고르고 다시 가자.' },
};
export const petPersonality = (pet: string) => {
    const added = newPet(pet);
    return added ? {name: added.name, en: added.en, trait: added.trait, hello: [added.hello, '네가 오니까 오늘도 마음이 포근해졌어.', '오늘의 작은 기쁨을 함께 모아 볼까?'], cheer: '네가 한 걸음 해낸 순간을 나도 기억할게!', rest: '잠깐 쉬어도 좋아. 네 옆에서 기다릴게.'} : breedPersonalities[pet] || personalities[friendBase(pet)] || personalities.cat;
};
