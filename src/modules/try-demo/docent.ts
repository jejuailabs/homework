import {demoAsset} from './data';

/**
 * Three real third-grade presentations, shared with guardian and teacher consent. Names were blurred on the pictures,
 * the spoken name was cut from the start of each recording, and the students here carry the demo class's made-up names.
 */
export type DocentSegment = {start: number; end: number; text: string};
export type DocentItem = {id: string; title: string; theme: string; studentId: string; duration: number; segments: DocentSegment[]};

export const docentItems: DocentItem[] = [
  {id: 'docent-1', title: '태권도의 띠 색깔', theme: '띠마다 뜻을 적은 발표 자료', studentId: 's4', duration: 16.22, segments: [
    {start: 0, end: 5, text: '제 자료의 주제는 태권도의 띠의 색깔이고요.'},
    {start: 5, end: 12, text: '태권도의 띠의 색깔이 주제여서 태권도 글씨와 띠의 글씨를 크고 두껍게 했습니다.'},
    {start: 12, end: 16.22, text: '또 오방색으로 띠의 색깔을 했습니다.'},
  ]},
  {id: 'docent-2', title: '태권도 띠 색깔', theme: '띠 순서를 그림으로 정리', studentId: 's6', duration: 18.96, segments: [
    {start: 0, end: 3.5, text: '제목은 태권도의 띠 색깔입니다.'},
    {start: 3.5, end: 10, text: '제목은 크게 했고 하얀 띠는 첫 번째 띠여서 그렇게 썼습니다.'},
    {start: 10, end: 14, text: '노란 띠는 두 번째 띠여서 그렇게 썼고요.'},
    {start: 14, end: 18.96, text: '실력이 늘면 띠 색깔도 바뀝니다.'},
  ]},
  {id: 'docent-3', title: '태권도를 하면 좋은 점', theme: '체력·집중력·존중·예절', studentId: 's7', duration: 29.23, segments: [
    {start: 0, end: 5.4, text: '일단 태권도 제목은 크게 썼고'},
    {start: 5.4, end: 10.6, text: '왜냐하면 무엇인지 보이려고 크게 썼습니다.'},
    {start: 10.6, end: 13.2, text: '그리고 왜 좋은 점을 썼냐면'},
    {start: 13.2, end: 19.4, text: '일단 태권도는 많은 좋은 점과 우리 몸을 강하게 만들어줘서 있고요.'},
    {start: 19.4, end: 29.23, text: '그리고 미덕도 키울 수 있어서 좋은 점을 썼어요.'},
  ]},
];
export const docentItem = (id: unknown) => docentItems.find(item => item.id === id) ?? null;
export const docentImage = (id: string, thumb = false) => demoAsset(`docent/${id}${thumb ? '-thumb' : ''}.webp`);
export const docentAudio = (id: string) => demoAsset(`docent/${id}.m4a`);
