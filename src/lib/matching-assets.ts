import type {MatchingAssetSource} from './matching-deck';

export type MatchingAsset = {id: string; ko: string; en: string; src: string; source: MatchingAssetSource};
export const NOTO_VERSION = 'v2.047';
export const FLAGS_VERSION = 'v7.5.0';
const animals = [
  ['1f436','강아지','Dog'],['1f431','고양이','Cat'],['1f42d','생쥐','Mouse'],['1f439','햄스터','Hamster'],
  ['1f430','토끼','Rabbit'],['1f98a','여우','Fox'],['1f43b','곰','Bear'],['1f43c','판다','Panda'],
  ['1f428','코알라','Koala'],['1f42f','호랑이','Tiger'],['1f981','사자','Lion'],['1f42e','소','Cow'],
  ['1f437','돼지','Pig'],['1f438','개구리','Frog'],['1f435','원숭이','Monkey'],['1f414','닭','Chicken'],
  ['1f427','펭귄','Penguin'],['1f426','새','Bird'],['1f424','병아리','Chick'],['1f986','오리','Duck'],
  ['1f985','독수리','Eagle'],['1f989','부엉이','Owl'],['1f987','박쥐','Bat'],['1f43a','늑대','Wolf'],
  ['1f417','멧돼지','Boar'],['1f434','말','Horse'],['1f41d','꿀벌','Bee'],['1f41b','애벌레','Caterpillar'],
  ['1f98b','나비','Butterfly'],['1f40c','달팽이','Snail'],['1f41e','무당벌레','Ladybug'],['1f41c','개미','Ant'],
  ['1f577','거미','Spider'],['1f422','거북','Turtle'],['1f40d','뱀','Snake'],['1f98e','도마뱀','Lizard'],
  ['1f419','문어','Octopus'],['1f991','오징어','Squid'],['1f980','게','Crab'],['1f990','새우','Shrimp'],
  ['1f420','열대어','Tropical fish'],['1f421','복어','Pufferfish'],['1f42c','돌고래','Dolphin'],['1f433','고래','Whale'],
  ['1f988','상어','Shark'],['1f40a','악어','Crocodile'],['1f98f','코뿔소','Rhinoceros'],['1f418','코끼리','Elephant'],
  ['1f992','기린','Giraffe'],['1f993','얼룩말','Zebra'],['1f98d','고릴라','Gorilla'],['1f410','염소','Goat'],
  ['1f40f','양','Sheep'],['1f42a','낙타','Camel'],['1f998','캥거루','Kangaroo'],['1f9a5','나무늘보','Sloth'],
  ['1f9a6','수달','Otter'],['1f994','고슴도치','Hedgehog'],['1f99c','앵무새','Parrot'],['1f9a9','홍학','Flamingo'],
] as const;
const everyday = [
  ['1f34e','사과','Apple'],['1f34c','바나나','Banana'],['1f347','포도','Grapes'],['1f353','딸기','Strawberry'],
  ['1f349','수박','Watermelon'],['1f34d','파인애플','Pineapple'],['1f352','체리','Cherries'],['1f351','복숭아','Peach'],
  ['1f350','배','Pear'],['1f95d','키위','Kiwi'],['1f955','당근','Carrot'],['1f33d','옥수수','Corn'],
  ['1f966','브로콜리','Broccoli'],['1f344','버섯','Mushroom'],['1f35e','빵','Bread'],['1f9c0','치즈','Cheese'],
  ['1f697','자동차','Car'],['1f68c','버스','Bus'],['1f682','기차','Train'],['1f6b2','자전거','Bicycle'],
  ['2708','비행기','Airplane'],['1f680','로켓','Rocket'],['1f681','헬리콥터','Helicopter'],['1f6a2','배','Ship'],
  ['1f692','소방차','Fire engine'],['1f691','구급차','Ambulance'],['1f69c','트랙터','Tractor'],['1f6f4','킥보드','Scooter'],
  ['1f4da','책','Books'],['270f','연필','Pencil'],['1f58d','크레용','Crayon'],['2702','가위','Scissors'],
  ['1f4cf','자','Ruler'],['1f393','학사모','Graduation cap'],['1f3a8','팔레트','Palette'],['1f3b8','기타','Guitar'],
  ['1f3b9','피아노','Piano'],['26bd','축구공','Soccer ball'],['1f3c0','농구공','Basketball'],['1f3be','테니스공','Tennis ball'],
  ['1f3b2','주사위','Dice'],['1f9e9','퍼즐','Puzzle'],['1f4f7','카메라','Camera'],['23f0','알람시계','Alarm clock'],
  ['1f511','열쇠','Key'],['1f381','선물','Gift'],['1f388','풍선','Balloon'],['2602','우산','Umbrella'],
  ['1f308','무지개','Rainbow'],['2600','해','Sun'],['1f319','달','Moon'],['2b50','별','Star'],
  ['1f33b','해바라기','Sunflower'],['1f337','튤립','Tulip'],['1f332','나무','Tree'],['1f335','선인장','Cactus'],
  ['1f340','네잎클로버','Clover'],['1f344','버섯','Mushroom'],['1f3e0','집','House'],['1f3eb','학교','School'],
] as const;
const flags = [
  ['kr','대한민국','South Korea'],['jp','일본','Japan'],['cn','중국','China'],['mn','몽골','Mongolia'],
  ['vn','베트남','Vietnam'],['th','태국','Thailand'],['ph','필리핀','Philippines'],['my','말레이시아','Malaysia'],
  ['sg','싱가포르','Singapore'],['in','인도','India'],['np','네팔','Nepal'],['bt','부탄','Bhutan'],
  ['lk','스리랑카','Sri Lanka'],['bd','방글라데시','Bangladesh'],['pk','파키스탄','Pakistan'],['kz','카자흐스탄','Kazakhstan'],
  ['uz','우즈베키스탄','Uzbekistan'],['tr','튀르키예','Türkiye'],['gr','그리스','Greece'],['gb','영국','United Kingdom'],
  ['fr','프랑스','France'],['de','독일','Germany'],['it','이탈리아','Italy'],['es','스페인','Spain'],
  ['pt','포르투갈','Portugal'],['ie','아일랜드','Ireland'],['be','벨기에','Belgium'],['ch','스위스','Switzerland'],
  ['at','오스트리아','Austria'],['dk','덴마크','Denmark'],['se','스웨덴','Sweden'],['no','노르웨이','Norway'],
  ['fi','핀란드','Finland'],['is','아이슬란드','Iceland'],['cz','체코','Czechia'],['hr','크로아티아','Croatia'],
  ['ua','우크라이나','Ukraine'],['us','미국','United States'],['ca','캐나다','Canada'],['mx','멕시코','Mexico'],
  ['br','브라질','Brazil'],['ar','아르헨티나','Argentina'],['cl','칠레','Chile'],['pe','페루','Peru'],
  ['uy','우루과이','Uruguay'],['ec','에콰도르','Ecuador'],['cr','코스타리카','Costa Rica'],['pa','파나마','Panama'],
  ['za','남아프리카공화국','South Africa'],['ke','케냐','Kenya'],['tz','탄자니아','Tanzania'],['ug','우간다','Uganda'],
  ['gh','가나','Ghana'],['ma','모로코','Morocco'],['eg','이집트','Egypt'],['au','오스트레일리아','Australia'],
  ['nz','뉴질랜드','New Zealand'],['fj','피지','Fiji'],['pg','파푸아뉴기니','Papua New Guinea'],['ws','사모아','Samoa'],
] as const;
const notoAsset = ([code, ko, en]: readonly string[]): MatchingAsset => ({
  id: `noto-${code}`, ko, en, src: `/tools/matching/noto/${code}.svg`,
  source: {kind: 'bundled', sourceUrl: `https://github.com/googlefonts/noto-emoji/blob/${NOTO_VERSION}/svg/emoji_u${code}.svg`,
    license: 'Apache-2.0', attribution: 'Google Noto Emoji', version: NOTO_VERSION},
});
const unique = (assets: MatchingAsset[]) => assets.filter((asset, index) => assets.findIndex(other => other.id === asset.id) === index);
export const MATCHING_PACKS = [
  {id: 'animals', ko: '동물 친구들', en: 'Animal friends', assets: animals.map(notoAsset)},
  {id: 'everyday', ko: '우리 주변 그림', en: 'Everyday pictures', assets: unique(everyday.map(notoAsset))},
  {id: 'flags', ko: '세계의 국기', en: 'World flags', assets: flags.map(([code, ko, en]): MatchingAsset => ({
    id: `flag-${code}`, ko, en, src: `/tools/matching/flags/${code}.svg`,
    source: {kind: 'bundled', sourceUrl: `https://github.com/lipis/flag-icons/blob/${FLAGS_VERSION}/flags/4x3/${code}.svg`,
      license: 'MIT', attribution: 'flag-icons, Panayiotis Lipiridis and contributors', version: FLAGS_VERSION},
  }))},
] as const;
export const MATCHING_PACK_IDS = MATCHING_PACKS.map(pack => pack.id);
