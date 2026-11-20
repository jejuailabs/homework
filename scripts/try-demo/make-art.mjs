// Draws the 25 sample artworks of the login-free demo class (햇살초 3학년 2반) as crayon-style pictures.
// All of it is synthetic: no real student's work or name is used.
//   node scripts/try-demo/make-art.mjs <output dir>
// Writes <id>.webp (1200px) and <id>-thumb.webp (480px). Upload with scripts/try-demo/upload-assets.mjs.
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import sharp from 'sharp';

const out = resolve(process.argv[2] || '.qa/try-demo/art');
mkdirSync(out, {recursive: true});
const W = 1200, H = 900;
// Crayon look: a wobble on every outline, a grainy mask that lets the paper show through the colour.
const defs = seed => `<defs>
  <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>
  <filter id="crayon" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="${seed}" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="12" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed + 7}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.75" result="m"/>
    <feComposite in="d" in2="m" operator="in"/></filter>
  <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="${seed + 3}"/><feColorMatrix type="matrix" values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 .09 0"/></filter>
</defs>`;
const fill = (shape, color, opacity = 1) => `<g filter="url(#crayon)" fill="${color}" opacity="${opacity}">${shape}</g>`;
const line = (shape, color = '#4a3b33', width = 9) => `<g filter="url(#wobble)" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${shape}</g>`;
const both = (shape, color, stroke = '#4a3b33', width = 9) => fill(shape, color) + line(shape, stroke, width);
const circle = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const ellipse = (x, y, rx, ry, rot = 0) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}/>`;
const rect = (x, y, w, h, r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const path = d => `<path d="${d}"/>`;
const poly = points => `<polygon points="${points}"/>`;
// Scribbled sky or ground: a few fat overlapping strokes instead of a flat fill.
const scribble = (y0, y1, color, opacity = .85) => {
  let d = '';
  for (let y = y0; y < y1; y += 46) d += `M-20 ${y} Q300 ${y - 26} 620 ${y + 8} T1230 ${y - 6} `;
  return `<g filter="url(#crayon)" fill="none" stroke="${color}" stroke-width="62" stroke-linecap="round" opacity="${opacity}"><path d="${d}"/></g>`;
};
const sun = (x, y, r = 80) => {
  let rays = '';
  for (let i = 0; i < 12; i++) {const a = i * Math.PI / 6; rays += `M${x + Math.cos(a) * (r + 22)} ${y + Math.sin(a) * (r + 22)} L${x + Math.cos(a) * (r + 70)} ${y + Math.sin(a) * (r + 70)} `;}
  return line(path(rays), '#f2a33a', 12) + both(circle(x, y, r), '#ffd24a', '#e8922c');
};
const cloud = (x, y, s = 1) => both(path(`M${x} ${y} q${-60 * s} ${-70 * s} ${40 * s} ${-90 * s} q${50 * s} ${-70 * s} ${130 * s} ${-20 * s} q${90 * s} ${-30 * s} ${110 * s} ${50 * s} q${60 * s} ${50 * s} ${-30 * s} ${70 * s} z`), '#ffffff', '#8fb2d6', 7);
const grass = (y = 720, color = '#8cc152') => scribble(y, 930, color);
const flower = (x, y, color, s = 1) => {
  let petals = '';
  for (let i = 0; i < 6; i++) {const a = i * Math.PI / 3; petals += ellipse(x + Math.cos(a) * 30 * s, y + Math.sin(a) * 30 * s, 24 * s, 24 * s);}
  return line(path(`M${x} ${y + 30 * s} q${10 * s} ${80 * s} 0 ${150 * s}`), '#4f9d4a', 9) + fill(petals, color) + both(circle(x, y, 18 * s), '#ffd24a', '#c97a1e', 5);
};
const eyes = (x, y, gap = 34, r = 9) => `<g filter="url(#wobble)" fill="#3a2d28">${circle(x - gap, y, r)}${circle(x + gap, y, r)}</g>`;
const smile = (x, y, w = 40) => line(path(`M${x - w} ${y} q${w} ${w * .8} ${w * 2} 0`), '#3a2d28', 7);
const star = (x, y, r, color = '#ffe07a') => {
  let pts = '';
  for (let i = 0; i < 10; i++) {const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; pts += `${x + Math.cos(a) * rr},${y + Math.sin(a) * rr} `;}
  return fill(poly(pts), color);
};
const stars = (seed, n = 18) => {let s = '', v = seed; const rnd = () => (v = (v * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < n; i++) s += star(60 + rnd() * 1080, 50 + rnd() * 780, 12 + rnd() * 18, rnd() > .5 ? '#ffe07a' : '#ffffff'); return s;};
const bubbles = (seed, n = 10) => {let s = '', v = seed; const rnd = () => (v = (v * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < n; i++) s += line(circle(80 + rnd() * 1040, 60 + rnd() * 760, 14 + rnd() * 22), '#ffffff', 6); return s;};
const seaweed = (x, color = '#3f9b6b') => line(path(`M${x} 900 q-50 -90 0 -170 q50 -80 0 -170 q-40 -70 10 -130`), color, 22);
const fish = (x, y, s, body, flip = false) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">${both(poly('120,0 190,-60 190,60'), body)}${both(ellipse(0, 0, 140, 82), body)}${line(path('M-20 -50 q40 50 0 100 M40 -40 q30 40 0 80'), '#ffffff', 8)}<g filter="url(#wobble)" fill="#3a2d28">${circle(-82, -18, 12)}</g>${line(path('M-120 22 q20 18 40 4'), '#3a2d28', 6)}</g>`;
const SKY = '#a9d8f5', SEA = '#4fb3d9', DEEP = '#2f7fb8', NIGHT = '#2b2f6b';

const art = {
  // 봄 그림전
  'spring-01': s => scribble(40, 700, SKY) + grass() + sun(1010, 170) + both(rect(540, 430, 110, 330, 20), '#9b6a45') + fill(circle(480, 330, 150) + circle(680, 300, 170) + circle(600, 200, 150) + circle(760, 420, 120) + circle(430, 450, 110), '#ffb7cf') + fill(circle(520, 280, 26) + circle(700, 360, 22) + circle(610, 180, 24) + circle(770, 300, 20) + circle(450, 400, 22) + circle(260, 620, 14) + circle(900, 560, 14) + circle(330, 500, 12), '#ff8fb5') + line(circle(600, 310, 235), '#e06f98', 0),
  'spring-02': s => scribble(40, 700, SKY) + grass() + sun(190, 170) + cloud(860, 240) + both(rect(390, 430, 420, 330), '#ffe2a8') + both(poly('340,440 600,210 860,440'), '#e8604c') + both(rect(540, 570, 110, 190, 10), '#9b6a45') + both(rect(430, 480, 90, 90), '#bfe6ff') + both(rect(680, 480, 90, 90), '#bfe6ff') + line(path('M475 480 v90 M430 525 h90 M725 480 v90 M680 525 h90')) + both(rect(700, 240, 50, 110), '#c9c9c9') + flower(230, 620, '#ff8fb5') + flower(960, 640, '#b98cf0'),
  'spring-03': s => scribble(40, 720, SKY) + grass(740) + ['#e8604c', '#f2a33a', '#ffd24a', '#7cc46b', '#4fa3e0', '#8b6fd6'].map((c, i) => line(path(`M${150 + i * 34} 760 A${450 - i * 34} ${450 - i * 34} 0 0 1 ${1050 - i * 34} 760`), c, 36)).join('') + cloud(160, 780, .9) + cloud(900, 790, .9) + sun(600, 150, 60),
  'spring-04': s => scribble(40, 560, SKY) + grass(580, '#9ad06a') + sun(1030, 150, 70) + [[170, 520, '#ff8fb5'], [380, 600, '#ffd24a'], [590, 520, '#b98cf0'], [800, 610, '#ff7d6b'], [1010, 540, '#ffffff'], [280, 700, '#ffb347'], [700, 720, '#ff8fb5']].map(([x, y, c]) => flower(x, y, c, 1.15)).join(''),
  'spring-05': s => scribble(40, 900, '#d9f0c9') + flower(180, 650, '#ff8fb5') + flower(1010, 680, '#ffd24a') + both(ellipse(430, 330, 190, 150, -20), '#ffb347') + both(ellipse(770, 330, 190, 150, 20), '#ffb347') + both(ellipse(460, 590, 140, 120, 20), '#ff8fb5') + both(ellipse(740, 590, 140, 120, -20), '#ff8fb5') + fill(circle(430, 330, 50) + circle(770, 330, 50), '#ffe07a') + both(ellipse(600, 450, 42, 210), '#6b4a3a') + line(path('M585 250 q-60 -110 -120 -120 M615 250 q60 -110 120 -120'), '#4a3b33', 8),
  'spring-06': s => scribble(40, 640, SKY) + grass(660) + sun(160, 150, 66) + [[330, 300, '#4f7fd0', 1.15], [560, 300, '#e8604c', 1.1], [770, 400, '#ffd24a', .8], [930, 430, '#7cc46b', .7]].map(([x, y, c, k]) => both(poly(`${x - 70 * k},${y + 300 * k} ${x},${y + 80 * k} ${x + 70 * k},${y + 300 * k}`), c) + both(circle(x, y, 78 * k), '#ffe0c2') + eyes(x, y - 6 * k, 28 * k, 8 * k) + smile(x, y + 22 * k, 26 * k) + line(path(`M${x - 60 * k} ${y + 150 * k} l${-70 * k} ${70 * k} M${x + 60 * k} ${y + 150 * k} l${70 * k} ${70 * k}`))).join('') + fill(path('M560 205 q-90 -10 -80 100 q80 -70 160 0 q10 -100 -80 -100z'), '#6b4a3a'),
  'spring-07': s => scribble(40, 660, '#ffe9c7') + grass(680) + both(ellipse(600, 560, 260, 170), '#c98b5a') + both(circle(380, 400, 150), '#c98b5a') + both(ellipse(270, 320, 60, 110, -25), '#8a5a3a') + both(ellipse(480, 300, 60, 110, 25), '#8a5a3a') + eyes(380, 380, 50, 13) + both(ellipse(380, 440, 32, 24), '#3a2d28') + smile(380, 468, 34) + line(path('M840 500 q110 -90 70 -190'), '#8a5a3a', 30) + both(rect(450, 690, 60, 110, 20), '#c98b5a') + both(rect(700, 690, 60, 110, 20), '#c98b5a') + fill(ellipse(380, 500, 26, 34), '#ff8fa3') + both(circle(940, 720, 46), '#e8604c'),
  'spring-08': s => scribble(40, 900, '#fbe6ef') + both(ellipse(600, 600, 250, 210), '#f6b35e') + both(circle(600, 330, 190), '#f6b35e') + both(poly('440,240 460,70 570,190'), '#f6b35e') + both(poly('760,240 740,70 630,190'), '#f6b35e') + fill(poly('470,200 475,120 530,180') + poly('730,200 725,120 670,180'), '#ffc7d6') + eyes(600, 310, 70, 20) + fill(poly('580,370 620,370 600,395'), '#ff8fa3') + line(path('M600 395 q-30 40 -60 10 M600 395 q30 40 60 10 M450 350 h-130 M450 380 l-120 30 M750 350 h130 M750 380 l120 30'), '#4a3b33', 7) + line(path('M830 700 q150 -40 110 -200'), '#e0913a', 34) + line(path('M520 520 q80 30 160 0 M500 600 q100 30 200 0'), '#e0913a', 12),
  'spring-09': s => scribble(40, 900, SKY) + cloud(180, 260) + cloud(900, 200, .8) + [[330, 300, '#e8604c'], [520, 220, '#ffd24a'], [710, 300, '#4fa3e0'], [900, 380, '#8b6fd6'], [430, 460, '#7cc46b']].map(([x, y, c]) => line(path(`M${x} ${y + 120} q${(600 - x) * .3} 180 ${600 - x} 420`), '#6b5a52', 5) + both(ellipse(x, y, 92, 116), c) + fill(ellipse(x - 30, y - 40, 18, 30, -20), '#ffffff', .7)).join('') + both(circle(600, 780, 44), '#ffe0c2'),
  // 바닷속 친구들
  'sea-01': s => scribble(40, 900, SEA) + bubbles(s) + seaweed(140) + seaweed(1060, '#57b07c') + fish(420, 320, 1.1, '#ff9f43') + fish(820, 560, .8, '#ffd24a', true) + fish(260, 680, .55, '#ff7d9c'),
  'sea-02': s => scribble(40, 900, '#69c0e2') + bubbles(s, 7) + both(path('M170 520 q40 -280 430 -270 q340 10 420 250 q60 -100 130 -110 q-10 100 -70 170 q70 60 80 150 q-110 -10 -160 -90 q-140 150 -400 150 q-360 0 -430 -250z'), '#4f7fd0') + fill(path('M240 560 q200 130 520 60 q-200 130 -430 60z'), '#dfeeff') + `<g filter="url(#wobble)" fill="#fff">${circle(330, 450, 26)}</g><g filter="url(#wobble)" fill="#3a2d28">${circle(336, 452, 12)}</g>` + smile(300, 530, 46) + line(path('M560 250 q-10 -90 -70 -120 M560 250 q10 -90 70 -120'), '#bfe6ff', 14),
  'sea-03': s => scribble(40, 900, DEEP) + bubbles(s, 8) + [-3, -2, -1, 1, 2, 3].map(i => line(path(`M${600 + i * 60} 470 q${i * 70} 130 ${i * 90} 300 q${i * 10} 50 ${i * 40} 60`), '#e86fa0', 44)).join('') + both(ellipse(600, 340, 230, 200), '#f58ab5') + eyes(600, 330, 80, 26) + `<g filter="url(#wobble)" fill="#fff">${circle(512, 322, 9)}${circle(672, 322, 9)}</g>` + smile(600, 410, 50) + fill(circle(470, 400, 26) + circle(730, 400, 26), '#ffb3cf'),
  'sea-04': s => scribble(40, 900, '#58bcd6') + seaweed(1040) + bubbles(s, 6) + both(ellipse(310, 300, 80, 46, -30), '#7cc46b') + both(ellipse(880, 300, 80, 46, 30), '#7cc46b') + both(ellipse(330, 640, 70, 44, 30), '#7cc46b') + both(ellipse(860, 640, 70, 44, -30), '#7cc46b') + both(circle(960, 470, 90), '#8fd17a') + eyes(985, 450, 26, 10) + smile(990, 490, 22) + both(ellipse(600, 470, 300, 220), '#4f9d4a') + line(path('M600 250 v440 M330 400 q270 -90 540 0 M330 540 q270 90 540 0 M450 280 l-70 380 M750 280 l70 380'), '#2f6e37', 9),
  'sea-05': s => scribble(40, 900, '#3b6fb5') + bubbles(s, 12) + [[380, 330, '#c9a6ff', 1], [800, 470, '#ffb3d9', .75]].map(([x, y, c, k]) => [-2, -1, 0, 1, 2].map(i => line(path(`M${x + i * 52 * k} ${y + 30 * k} q${40 * k} ${110 * k} 0 ${220 * k} q${-40 * k} ${90 * k} 0 ${170 * k}`), c, 16 * k)).join('') + both(path(`M${x - 170 * k} ${y + 40 * k} q0 ${-230 * k} ${170 * k} ${-230 * k} q${170 * k} 0 ${170 * k} ${230 * k} z`), c, '#7d5fc0') + eyes(x, y - 60 * k, 44 * k, 11 * k) + smile(x, y - 20 * k, 26 * k)).join(''),
  'sea-06': s => scribble(40, 900, '#2f8fc2') + bubbles(s, 9) + seaweed(170) + both(rect(280, 380, 620, 280, 140), '#ffd24a') + both(rect(500, 250, 200, 150, 30), '#ffd24a') + both(rect(585, 150, 34, 110), '#c9c9c9') + both(rect(585, 150, 110, 34), '#c9c9c9') + [400, 590, 780].map(x => both(circle(x, 520, 62), '#bfe6ff', '#4a3b33') + fill(ellipse(x - 20, 500, 14, 22, -20), '#ffffff', .8)).join('') + both(poly('900,460 1010,400 1010,640 900,580'), '#e8604c') + line(path('M1040 470 q40 50 0 100'), '#ffffff', 8),
  'sea-07': s => scribble(40, 640, '#63c4de') + scribble(660, 930, '#f2d79a') + bubbles(s, 6) + [[230, 560, '#ff7d9c'], [360, 620, '#ff9f43'], [960, 590, '#b98cf0']].map(([x, y, c]) => line(path(`M${x} ${y + 190} v-150 M${x} ${y + 110} q-70 -30 -60 -130 M${x} ${y + 90} q70 -40 60 -150 M${x} ${y + 40} q-20 -60 10 -120`), c, 28)).join('') + star(620, 700, 150, '#ff9f43') + eyes(620, 690, 30, 9) + smile(620, 722, 20) + both(path('M790 760 q10 -110 100 -110 q90 0 100 110 z'), '#ffe2a8') + line(path('M840 760 q10 -70 50 -100 M890 760 v-108 M940 760 q-10 -70 -50 -100')),
  'sea-08': s => scribble(40, 900, '#3f95c9') + bubbles(s, 8) + both(poly('520,300 600,120 700,310'), '#7f96ad') + both(poly('960,440 1140,300 1100,480 1140,650'), '#7f96ad') + both(path('M150 500 q160 -230 500 -190 q260 30 330 170 q-110 180 -420 180 q-270 0 -410 -160z'), '#9fb4c9') + fill(path('M230 540 q260 130 620 40 q-250 130 -520 80z'), '#f3f7fb') + eyes(330, 440, 0, 16) + line(path('M230 540 q110 60 250 40 M470 430 v70 M520 430 v70 M570 430 v70')) + fill(poly('280,548 300,585 320,556 340,592 360,560 380,594 400,562'), '#ffffff'),
  // 내가 꿈꾸는 우주
  'space-01': s => scribble(40, 900, NIGHT) + stars(s) + both(poly('520,560 440,700 540,660'), '#e8604c') + both(poly('680,560 760,700 660,660'), '#e8604c') + both(path('M600 110 q150 160 110 460 h-220 q-40 -300 110 -460z'), '#f3f3f3') + both(path('M600 110 q80 80 104 190 h-208 q24 -110 104 -190z'), '#e8604c') + both(circle(600, 400, 62), '#bfe6ff') + fill(path('M520 580 h160 q-30 190 -80 260 q-50 -70 -80 -260z'), '#ffb347') + fill(path('M560 580 h80 q-10 110 -40 170 q-30 -60 -40 -170z'), '#ffe07a'),
  'space-02': s => scribble(40, 900, '#23265c') + stars(s, 22) + line(ellipse(600, 470, 430, 110, -16), '#f2c17a', 34) + both(circle(600, 470, 230), '#f2a65a') + line(path('M400 400 q200 60 400 -20 M390 500 q210 70 420 -10 M430 580 q170 40 340 -10'), '#d9823a', 16) + fill(path('M185 590 a430 110 -16 0 0 830 -238 l10 30 a430 110 -16 0 1 -830 238z'), '#f7d8a3') + both(circle(210, 220, 52), '#8fd1ff') + both(circle(1000, 730, 36), '#ff9fb5'),
  'space-03': s => scribble(40, 900, NIGHT) + stars(s, 14) + both(rect(450, 420, 300, 300, 80), '#f3f3f3') + both(rect(330, 460, 130, 80, 40), '#f3f3f3') + both(rect(740, 400, 130, 80, 40), '#f3f3f3') + both(rect(480, 700, 100, 150, 40), '#f3f3f3') + both(rect(620, 700, 100, 150, 40), '#f3f3f3') + both(rect(530, 500, 140, 100, 16), '#8fb2d6') + fill(circle(565, 550, 14), '#e8604c') + fill(circle(615, 550, 14), '#ffd24a') + both(circle(600, 280, 180), '#f3f3f3') + both(ellipse(600, 290, 130, 110), '#3b4a8a') + eyes(600, 280, 44, 14) + smile(600, 320, 30) + fill(ellipse(540, 240, 22, 34, -30), '#ffffff', .5) + star(880, 360, 46),
  'space-04': s => scribble(40, 900, '#2a2360') + stars(s, 14) + both(ellipse(600, 620, 400, 100), '#c9c9c9') + fill(circle(330, 620, 22) + circle(470, 650, 22) + circle(600, 660, 22) + circle(730, 650, 22) + circle(870, 620, 22), '#ffd24a') + both(path('M400 600 q0 -240 200 -240 q200 0 200 240z'), '#bfe6ff') + both(circle(600, 500, 86), '#8fd17a') + both(ellipse(560, 480, 24, 32), '#ffffff') + both(ellipse(640, 480, 24, 32), '#ffffff') + `<g filter="url(#wobble)" fill="#3a2d28">${circle(562, 486, 10)}${circle(642, 486, 10)}</g>` + smile(600, 530, 26) + line(path('M560 420 l-30 -70 M640 420 l30 -70'), '#4f9d4a', 9) + fill(circle(528, 344, 16) + circle(672, 344, 16), '#8fd17a') + fill(poly('440,700 760,700 900,900 300,900'), '#fff7a8', .45),
  'space-05': s => scribble(40, 900, '#1f2458') + stars(s, 10) + [[250, 620], [420, 420], [640, 480], [800, 260], [990, 380], [900, 640]].map(([x, y], i, a) => (i ? line(path(`M${a[i - 1][0]} ${a[i - 1][1]} L${x} ${y}`), '#bcd2ff', 6) : '') + star(x, y, 46)).join('') + line(path('M640 480 L900 640'), '#bcd2ff', 6) + both(path('M80 900 q150 -160 330 -90 q150 -100 300 -10 q180 -90 410 100z'), '#3d4f8a', '#2a376b'),
  'space-06': s => scribble(40, 900, NIGHT) + stars(s, 16) + both(circle(600, 480, 310), '#ffe9a8', '#d9b85a') + fill(circle(450, 380, 46) + circle(720, 600, 60) + circle(760, 340, 34) + circle(500, 640, 30), '#f2d27a') + both(ellipse(600, 560, 110, 90), '#ffffff') + both(circle(600, 430, 80), '#ffffff') + both(ellipse(560, 300, 28, 90, -8), '#ffffff') + both(ellipse(640, 300, 28, 90, 8), '#ffffff') + fill(ellipse(560, 300, 12, 60, -8) + ellipse(640, 300, 12, 60, 8), '#ffc7d6') + eyes(600, 420, 30, 10) + fill(circle(600, 450, 9), '#ff8fa3') + fill(circle(545, 455, 16) + circle(655, 455, 16), '#ffd3df'),
  'space-07': s => scribble(40, 640, '#262a66') + stars(s, 12) + scribble(680, 930, '#6fae5a') + fill(poly('470,450 730,450 900,900 300,900'), '#fff7a8', .5) + both(ellipse(600, 400, 380, 90), '#b9c2d0') + both(path('M420 380 q0 -200 180 -200 q180 0 180 200z'), '#9ee0ff') + fill(circle(330, 400, 20) + circle(460, 425, 20) + circle(600, 432, 20) + circle(740, 425, 20) + circle(870, 400, 20), '#ff7d6b') + both(ellipse(600, 760, 120, 80), '#ffffff') + both(circle(480, 720, 56), '#ffffff') + fill(circle(560, 740, 30) + circle(650, 780, 26), '#3a2d28') + eyes(470, 712, 18, 6) + line(path('M450 670 l-20 -40 M500 668 l14 -40'), '#4a3b33', 7),
  'space-08': s => scribble(40, 900, '#2b2f6b') + stars(s, 16) + both(circle(260, 240, 90), '#8fd1ff') + fill(path('M200 220 q40 -40 80 0 q30 30 60 10 q-20 60 -80 50 q-50 -10 -60 -60z'), '#7cc46b') + both(ellipse(600, 620, 200, 170), '#f6b35e') + both(circle(600, 380, 150), '#f6b35e') + both(poly('480,310 490,180 580,270'), '#f6b35e') + both(poly('720,310 710,180 620,270'), '#f6b35e') + eyes(600, 370, 54, 16) + fill(poly('584,415 616,415 600,435'), '#ff8fa3') + line(path('M600 435 q-24 30 -48 8 M600 435 q24 30 48 8'), '#4a3b33', 7) + line(circle(600, 370, 190), '#bfe6ff', 12) + fill(ellipse(500, 280, 26, 50, -35), '#ffffff', .5) + star(930, 520, 54) + line(path('M790 640 q110 -30 90 -150'), '#e0913a', 30),
};

const ids = Object.keys(art);
if (ids.length !== 25) throw new Error(`Expected 25 artworks, found ${ids.length}`);
let n = 0;
for (const id of ids) {
  const seed = 11 + n++ * 13;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(seed)}<rect width="100%" height="100%" fill="#fffaf0"/>${art[id](seed)}<rect width="100%" height="100%" filter="url(#paper)"/></svg>`;
  const png = await sharp(Buffer.from(svg), {density: 96}).png().toBuffer();
  await sharp(png).webp({quality: 84}).toFile(resolve(out, `${id}.webp`));
  await sharp(png).resize({width: 480}).webp({quality: 78}).toFile(resolve(out, `${id}-thumb.webp`));
}
console.log(`${ids.length} artworks -> ${out}`);
