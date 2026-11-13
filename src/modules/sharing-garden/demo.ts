import {MONTHLY_CAP, gardenStage, percentOf, publicClassLabel, seoulMonth} from './policy';
import type {DashboardData} from './dashboard';

/** Sample numbers for the business-plan screenshots (`/sharing-garden?demo=1`). The page labels them as a demo. */
export function demoDashboard(): DashboardData {
  const month = seoulMonth(new Date()), goalWon = 1_500_000, monthWon = 1_083_500;
  const names = ['햇살반', '4학년 어느 반', '꿈나무반', '무지개반', '6학년 어느 반', '별빛반', '3학년 어느 반', '솔방울반', '5학년 어느 반', '도토리반'];
  const ranking = names.map((label, index) => {
    const value = index < 6 ? MONTHLY_CAP : MONTHLY_CAP - (index - 5) * 140;
    return {rank: index + 1, label, won: value, full: value >= MONTHLY_CAP, ...(index === 2 ? {mine: true} : {})};
  });
  const credited = MONTHLY_CAP;
  return {
    month, preview: true, recipient: '', monthWon, monthClasses: 812, fullClasses: 431, goalWon, goalPercent: percentOf(monthWon, goalWon), totalWon: 4_276_500, ranking,
    role: 'teacher',
    classes: [
      {id: 'demo-a', name: '꿈나무반', month, points: 1720, credited, cap: MONTHLY_CAP, stage: gardenStage(credited), showName: true, label: '꿈나무반', paid: false},
      {id: 'demo-b', name: '5학년 2반 방과후', month, points: 860, credited: 860, cap: MONTHLY_CAP, stage: gardenStage(860), showName: false, label: publicClassLabel({grade: '5'}), paid: false},
    ],
  };
}
