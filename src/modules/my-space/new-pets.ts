// Basic portraits are independent of the original twelve friends' wardrobe assets.
export const newPets = [
  {
    "id": "dog-bichon",
    "name": "뽀송",
    "en": "Bbosong",
    "species": "아기 비숑",
    "base": "dog",
    "trait": "작은 응원을 폭신하게 안아 주는 친구",
    "hello": "폭신한 응원 한 조각 가져왔어!",
    "art": "/my-space/v4/pets/dog-bichon.webp"
  },
  {
    "id": "dog-corgi",
    "name": "식빵",
    "en": "Sikppang",
    "species": "아기 코기",
    "base": "dog",
    "trait": "짧은 발로 씩씩하게 모험하는 친구",
    "hello": "짧은 발로도 멀리 갈 수 있어. 같이 가자!",
    "art": "/my-space/v4/pets/dog-corgi.webp"
  },
  {
    "id": "dog-maltipoo",
    "name": "살구",
    "en": "Salgu",
    "species": "아기 말티푸",
    "base": "dog",
    "trait": "수줍은 미소로 마음을 나누는 친구",
    "hello": "살구빛 미소 하나, 네 옆에 놓아둘게.",
    "art": "/my-space/v4/pets/dog-maltipoo.webp"
  },
  {
    "id": "dog-pomeranian",
    "name": "밤톨",
    "en": "Bamtol",
    "species": "아기 포메라니안",
    "base": "dog",
    "trait": "작은 기쁨에도 꼬리가 들썩이는 친구",
    "hello": "오늘의 기쁜 일을 꼬리로 알려 줄게!",
    "art": "/my-space/v4/pets/dog-pomeranian.webp"
  },
  {
    "id": "dog-dachshund",
    "name": "초코",
    "en": "Choco",
    "species": "아기 닥스훈트",
    "base": "dog",
    "trait": "친구 이야기에 긴 귀를 기울이는 친구",
    "hello": "긴 귀로 네 이야기를 모두 들어 줄게.",
    "art": "/my-space/v4/pets/dog-dachshund.webp"
  },
  {
    "id": "animal-red-panda",
    "name": "단풍",
    "en": "Danpung",
    "species": "아기 레서판다",
    "base": "cat",
    "trait": "숲속의 작은 보물을 찾아 주는 친구",
    "hello": "오늘은 어떤 작은 보물을 발견할까?",
    "art": "/my-space/v4/pets/animal-red-panda.webp"
  },
  {
    "id": "animal-penguin",
    "name": "몽실",
    "en": "Mongsil",
    "species": "아기 펭귄",
    "base": "cat",
    "trait": "작은 걸음도 함께 기뻐하는 친구",
    "hello": "뒤뚱뒤뚱, 오늘도 한 걸음 같이 가자!",
    "art": "/my-space/v4/pets/animal-penguin.webp"
  },
  {
    "id": "animal-seal",
    "name": "찹쌀",
    "en": "Chapssal",
    "species": "아기 물범",
    "base": "otter",
    "trait": "느긋한 낮잠처럼 마음이 포근한 친구",
    "hello": "말랑한 마음으로 네 옆에 누워 있을게.",
    "art": "/my-space/v4/pets/animal-seal.webp"
  },
  {
    "id": "animal-fennec",
    "name": "모래",
    "en": "Morae",
    "species": "아기 사막여우",
    "base": "dog",
    "trait": "작은 소리에도 귀 기울이는 친구",
    "hello": "귀를 쫑긋! 오늘 네 이야기가 궁금해.",
    "art": "/my-space/v4/pets/animal-fennec.webp"
  },
  {
    "id": "fantasy-cloud-dragon",
    "name": "포롱",
    "en": "Porong",
    "species": "아기 구름용",
    "base": "alpaca",
    "trait": "구름 위의 상상을 함께 펼치는 친구",
    "hello": "구름 너머에는 어떤 이야기가 있을까?",
    "art": "/my-space/v4/pets/fantasy-cloud-dragon.webp"
  }
] as const;

export type NewPetId = typeof newPets[number]['id'];
export const newPet = (id: string) => newPets.find(pet => pet.id === id);
export const newPetFromArt = (src?: string) => newPets.find(pet => pet.art === src);
export const supportsSharedWearables = (pet: string) => !newPet(pet);

