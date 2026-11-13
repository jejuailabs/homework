import {MONTHLY_CAP, REGIONS, gardenSettings, gardenStage, percentOf, publicClassLabel, seoulMonth, type GardenSettings} from './policy';
import type {DashboardData} from './dashboard';

/** Sample numbers for the business-plan screenshots (`/sharing-garden?demo=1`). The page labels them as a demo. */
export function demoDashboard(): DashboardData {
  const month = seoulMonth(new Date()), goalWon = 1_500_000;
  const share: Record<string, number> = {seoul: 168, gyeonggi: 214, incheon: 41, gangwon: 22, chungbuk: 19, chungnam: 27, sejong: 14, daejeon: 23, gyeongbuk: 31, daegu: 36, ulsan: 15, jeonbuk: 25, gwangju: 21, jeonnam: 24, gyeongnam: 44, busan: 52, jeju: 36};
  const regions = REGIONS.map(region => ({code: region.code, name: region.name, classes: share[region.code], won: Math.round(share[region.code] * 1334 / 10) * 10}));
  const monthWon = regions.reduce((sum, region) => sum + region.won, 0);
  const sample: [string, string, string, GardenSettings['visibility'], number][] = [
    ['햇살반', '4', 'busan', 'class', MONTHLY_CAP], ['', '5', 'gyeonggi', 'region', MONTHLY_CAP], ['꿈나무반', '3', 'jeju', 'class', MONTHLY_CAP],
    ['', '6', 'seoul', 'school', MONTHLY_CAP], ['무지개반', '2', 'daegu', 'class', MONTHLY_CAP], ['', '4', 'gyeongnam', 'region', MONTHLY_CAP],
    ['별빛반', '1', 'gwangju', 'class', 1360], ['', '3', 'incheon', 'school', 1220], ['솔방울반', '5', 'jeonbuk', 'class', 1080], ['', '6', 'chungnam', 'region', 940],
  ];
  const schools: Record<string, string> = {busan: '바다초', seoul: '한강초', jeju: '한빛초', daegu: '팔공초', gwangju: '무등초', incheon: '송도초', jeonbuk: '모악초'};
  const ranking = sample.map(([name, grade, region, visibility, value], index) => ({
    rank: index + 1, label: publicClassLabel({name, grade, sharingGarden: {joined: true, region, school: schools[region] || '', visibility}}), won: value, full: value >= MONTHLY_CAP, ...(index === 2 ? {mine: true} : {}),
  }));
  const joined = gardenSettings({joined: true, region: 'jeju', school: '한빛초', visibility: 'class'});
  const off = gardenSettings({joined: false, region: '', school: '', visibility: 'region'});
  return {
    month, preview: true, recipient: '', monthWon, monthClasses: regions.reduce((sum, region) => sum + region.classes, 0), fullClasses: 431, goalWon, goalPercent: percentOf(monthWon, goalWon), totalWon: 4_276_500, ranking, regions,
    role: 'teacher',
    classes: [
      {id: 'demo-a', name: '꿈나무반', grade: '3', month, points: 1720, credited: MONTHLY_CAP, cap: MONTHLY_CAP, stage: gardenStage(MONTHLY_CAP), settings: joined, label: publicClassLabel({name: '꿈나무반', grade: '3', sharingGarden: joined}), paid: false},
      {id: 'demo-b', name: '5학년 방과후', grade: '5', month, points: 0, credited: 0, cap: MONTHLY_CAP, stage: gardenStage(0), settings: off, label: publicClassLabel({grade: '5'}), paid: false},
    ],
  };
}
