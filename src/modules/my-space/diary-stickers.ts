/** Original, versioned vector art. Never replace v1 assets: old diaries keep their appearance. */
export type DiarySticker = {
  id: string; kind: 'sticker'; name: string; en: string; price: number; art: string;
  mood?: 'happy' | 'excited' | 'calm' | 'sad' | 'angry' | 'worried';
};

const sticker = (id: string, name: string, en: string, price = 0): DiarySticker => ({
  id, kind: 'sticker', name, en, price, art: `/diary/v1/${id}.svg`,
});

export const moodStickers: DiarySticker[] = [
  {...sticker('mood-happy', '기뻐요', 'Happy'), mood: 'happy'},
  {...sticker('mood-excited', '신나요', 'Excited'), mood: 'excited'},
  {...sticker('mood-calm', '편안해요', 'Calm'), mood: 'calm'},
  {...sticker('mood-sad', '속상해요', 'Sad'), mood: 'sad'},
  {...sticker('mood-angry', '화나요', 'Angry'), mood: 'angry'},
  {...sticker('mood-worried', '걱정돼요', 'Worried'), mood: 'worried'},
];

export const defaultDiaryStickers: DiarySticker[] = [
  sticker('diary-rabbit', '포근 토끼', 'Cozy rabbit'),
  sticker('diary-bear', '꿀잠 곰', 'Sleepy bear'),
  sticker('diary-cat', '말랑 고양이', 'Little cat'),
  sticker('diary-heart', '두근 하트', 'Blushing heart'),
  sticker('diary-star', '반짝 별', 'Twinkle star'),
  sticker('diary-flower', '봄날 꽃', 'Spring flower'),
  sticker('diary-rainbow', '작은 무지개', 'Little rainbow'),
  sticker('diary-cloud', '몽글 구름', 'Fluffy cloud'),
  sticker('diary-ribbon', '분홍 리본', 'Pink ribbon'),
  sticker('diary-tape', '꽃잎 테이프', 'Petal washi tape'),
];

export const shopDiaryStickers: DiarySticker[] = [
  sticker('diary-moon', '잠자는 달', 'Sleeping moon', 5),
  sticker('diary-cake', '딸기 케이크', 'Strawberry cake', 10),
  sticker('diary-milk', '딸기 우유', 'Strawberry milk', 10),
  sticker('diary-cherry', '방울 체리', 'Cherry twins', 5),
  sticker('diary-butterfly', '나비의 산책', 'Little butterfly', 5),
  sticker('diary-tulip', '튤립 한 송이', 'One tulip', 5),
  sticker('diary-clover', '행운의 클로버', 'Lucky clover', 5),
  sticker('diary-shell', '바다의 조개', 'Seaside shell', 5),
  sticker('diary-envelope', '마음을 담은 편지', 'Letter from the heart', 10),
  sticker('diary-frame', '추억 사진틀', 'Memory photo frame', 10),
];

export const diaryStickers = [...moodStickers, ...defaultDiaryStickers, ...shopDiaryStickers];
export const diaryMood = (value?: string) => moodStickers.find(item => item.mood === value);
