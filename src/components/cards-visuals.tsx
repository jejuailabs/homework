/**
 * 카드놀이 인라인 SVG 모음. 팔레트 6종과 다크 모드를 따라가도록 CSS 토큰으로 그린다.
 * 파일로 쓰는 스티커·안내 그림은 public/cards/v1/ 에 있다.
 * 학생 세트 상세의 구간 행이 CardSectionProgress를 쓴다. 나머지는 아직 어느 화면에도 연결하지 않았다.
 */
import type {ReactNode} from 'react';

export type CardVisualMode = 'memorize' | 'choose' | 'write' | 'test' | 'team' | 'spotlight' | 'pair' | 'rain' | 'puzzle';

type IconProps = {size?: number; title?: string};
const soft = 'var(--accent-soft)';
const spot = 'var(--coral)';

function Frame({size = 28, title, children, box = 48, height}: IconProps & {children: ReactNode; box?: number; height?: number}) {
  const ratio = height ? height / box : 1;
  return (
    <svg width={size} height={size * ratio} viewBox={`0 0 ${box} ${height ?? box}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const modeArt: Record<CardVisualMode, ReactNode> = {
  memorize: <>
    <rect x="17" y="7" width="23" height="30" rx="5" fill={soft} transform="rotate(8 28 22)" opacity=".75"/>
    <rect x="8" y="12" width="23" height="30" rx="5" fill="var(--surface)" transform="rotate(-6 19 27)"/>
    <path d="M14 22.5l10-1M15 29.5l6.5-.6"/>
  </>,
  choose: <>
    <rect x="7" y="7" width="15" height="15" rx="4.5"/>
    <rect x="26" y="7" width="15" height="15" rx="4.5" fill={soft}/>
    <path d="M29.5 14.5l3 3 5-6"/>
    <rect x="7" y="26" width="15" height="15" rx="4.5"/>
    <rect x="26" y="26" width="15" height="15" rx="4.5"/>
  </>,
  write: <>
    <path d="M7 41h34"/>
    <path d="M12 33.5l1.8-7.2L31 9.2a3.4 3.4 0 0 1 4.8 0l1 1a3.4 3.4 0 0 1 0 4.8L19.7 32l-7.7 1.5Z" fill={soft}/>
    <path d="M28 12.5l6.5 6.5"/>
    <path d="M13.8 26.3l5.9 5.7" stroke={spot}/>
  </>,
  test: <>
    <path d="M12 5.5h17.5L38 14v28.5H12a2 2 0 0 1-2-2v-33a2 2 0 0 1 2-2Z" fill={soft}/>
    <path d="M29 6v8.5h8.5"/>
    <path d="M16.5 25.5l3 3 5.5-6"/>
    <path d="M16.5 35h15"/>
  </>,
  team: <>
    <path d="M9 42V8"/>
    <path d="M9 9c6-3.5 9 2.5 16 .5v13c-7 2-10-4-16-.5" fill={soft}/>
    <path d="M39 42V14"/>
    <path d="M39 15c-5-3-8 2-13.5.5v11c5.5 1.5 8.5-3.5 13.5-.5" fill="var(--surface)" stroke={spot}/>
  </>,
  spotlight: <>
    <circle cx="24" cy="27" r="16" fill={soft}/>
    <path d="M24 27V11M24 27l13.9 8M24 27L10.1 35"/>
    <path d="M24 3v8.5l-3.8-5M24 11.5l3.8-5" stroke={spot}/>
    <circle cx="24" cy="27" r="3.2" fill="var(--surface)"/>
  </>,
  pair: <>
    <rect x="5" y="9" width="17" height="22" rx="4.5" fill={soft}/>
    <rect x="26" y="18" width="17" height="22" rx="4.5" fill="var(--surface)"/>
    <path d="M22 20c3.5 0 2.5 8 6 8" stroke={spot}/>
    <circle cx="22" cy="20" r="2" fill="currentColor" stroke="none"/>
    <circle cx="28" cy="28" r="2" fill="currentColor" stroke="none"/>
  </>,
  rain: <>
    <rect x="7" y="5" width="14" height="10" rx="3.5" fill={soft}/>
    <rect x="28" y="12" width="14" height="10" rx="3.5" fill="var(--surface)"/>
    <rect x="13" y="24" width="14" height="10" rx="3.5" fill={soft}/>
    <path d="M6 42.5h36" stroke={spot}/>
    <path d="M35 27v6M33 31l2 2 2-2"/>
  </>,
  puzzle: <>
    <path d="M6 16h9.5a4 4 0 1 1 7 0H32v9a4 4 0 1 1 0 7v8H6Z" fill={soft}/>
    <path d="M32 16h6a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4h-6" strokeDasharray="2 5"/>
    <path d="M14 26.5h8" stroke={spot}/>
  </>,
};

export function CardModeIcon({mode, size, title}: IconProps & {mode: CardVisualMode}) {
  return <Frame size={size} title={title}>{modeArt[mode]}</Frame>;
}

/** 세트 행 사이에 끼우는 차시 메모. 행 높이에 맞춘 납작한 비율. */
export function CardMemoNote({size = 56, title}: IconProps) {
  return (
    <Frame size={size} title={title} box={56} height={24}>
      <path d="M4 5.5a3 3 0 0 1 3-3h34.5L52 13v5.5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" fill={soft}/>
      <path d="M41 3v10.5h10.5"/>
      <path d="M11 9.5h22M11 15.5h14"/>
    </Frame>
  );
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export function CardProgressRing({value, size = 64, label = '숙련도'}: {value: number; size?: number; label?: string}) {
  const percent = clampPercent(value);
  const radius = 26;
  const length = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${label} ${Math.round(percent)}%`}>
      <title>{`${label} ${Math.round(percent)}%`}</title>
      <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--border)" strokeWidth="7"/>
      <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${length * percent / 100} ${length}`} transform="rotate(-90 32 32)"/>
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text)" style={{fontVariantNumeric: 'tabular-nums'}}>{Math.round(percent)}</text>
    </svg>
  );
}

/** 구간 행의 암기·고르기·쓰기 세 칸. */
export function CardSectionProgress({steps, width = 132}: {steps: Array<{label: string; percent: number}>; width?: number}) {
  const gap = 4;
  const cell = (120 - gap * (steps.length - 1)) / Math.max(steps.length, 1);
  const summary = steps.map((step) => `${step.label} ${Math.round(clampPercent(step.percent))}%`).join(', ');
  return (
    <svg width={width} height={width * 20 / 120} viewBox="0 0 120 20" role="img" aria-label={summary}>
      {steps.map((step, index) => {
        const percent = clampPercent(step.percent);
        const x = index * (cell + gap);
        return (
          <g key={step.label}>
            <title>{`${step.label} ${Math.round(percent)}%`}</title>
            <rect x={x} y="4" width={cell} height="12" rx="6" fill="var(--border)"/>
            {percent > 0 && <rect x={x} y="4" width={Math.max(12, cell * percent / 100)} height="12" rx="6" fill="var(--accent)"/>}
            {percent >= 100 && <path d={`M${x + cell / 2 - 4} 10l3 3 5.5-5.5`} fill="none" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}
          </g>
        );
      })}
    </svg>
  );
}

const masteryNames = ['씨앗', '새싹', '잎', '꽃'];

/** 숙련 4단계. 다시 학습해도 줄지 않는 값을 넣는다. level은 1~4. */
export function CardMasterySteps({level, size = 148}: {level: number; size?: number}) {
  const current = Math.min(4, Math.max(1, Math.round(level)));
  const art = [
    <ellipse key="0" cx="0" cy="-5" rx="5" ry="6.5"/>,
    <g key="1"><path d="M0 0v-9"/><path d="M0-8c-1-5-6-6-8-5 0 4 4 6 8 5Z"/><path d="M0-6c1-5 6-6 8-5 0 4-4 6-8 5Z"/></g>,
    <g key="2"><path d="M0 0v-13"/><path d="M0-5c-2-5-8-6-10-5 0 5 5 7 10 5Z"/><path d="M0-9c2-5 8-6 10-5 0 5-5 7-10 5Z"/></g>,
    <g key="3"><path d="M0 0v-8"/><circle cy="-13" r="3.2" fill="var(--play-yellow)"/>{[0, 72, 144, 216, 288].map((turn) => <ellipse key={turn} cy="-19" rx="3.2" ry="4.2" transform={`rotate(${turn} 0 -13)`}/>)}</g>,
  ];
  return (
    <svg width={size} height={size * 40 / 148} viewBox="0 0 148 40" role="img" aria-label={`숙련 ${current}단계 ${masteryNames[current - 1]}`}>
      <path d="M22 33h104" stroke="var(--border)" strokeWidth="3" strokeLinecap="round"/>
      {art.map((shape, index) => {
        const reached = index < current;
        return (
          <g key={masteryNames[index]} transform={`translate(${22 + index * 34.7} 33)`} opacity={reached ? 1 : .32} fill={index === current - 1 ? 'var(--accent)' : 'var(--accent-soft)'} stroke="var(--accent-strong)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <title>{masteryNames[index]}</title>
            {shape}
          </g>
        );
      })}
    </svg>
  );
}

/** 프로젝터용 팀 진행. color는 roomTeamColors 값을 넘긴다. 이름과 수치를 함께 적어 색만으로 구분하지 않는다. */
export function CardTeamRaceTrack({teams, goal, width = 640}: {teams: Array<{name: string; color: string; value: number}>; goal: number; width?: number}) {
  const rows = teams.slice(0, 6);
  const rowHeight = 34;
  const height = rows.length * rowHeight + 8;
  const left = 84;
  const right = 76;
  const track = 640 - left - right;
  return (
    <svg width={width} height={width * height / 640} viewBox={`0 0 640 ${height}`} role="img" aria-label={rows.map((team) => `${team.name} ${team.value}`).join(', ') + `, 목표 ${goal}`}>
      {rows.map((team, index) => {
        const y = index * rowHeight + 8;
        const share = goal > 0 ? Math.min(1, Math.max(0, team.value / goal)) : 0;
        return (
          <g key={team.name}>
            <title>{`${team.name} ${team.value} / ${goal}`}</title>
            <text x={left - 12} y={y + 15} textAnchor="end" fontSize="15" fontWeight="700" fill="var(--text)">{team.name}</text>
            <rect x={left} y={y} width={track} height="20" rx="10" fill="var(--surface-alt)"/>
            {share > 0 && <rect x={left} y={y} width={Math.max(20, track * share)} height="20" rx="10" fill={team.color}/>}
            <text x={left + track + 12} y={y + 15} fontSize="15" fontWeight="700" fill="var(--text)" style={{fontVariantNumeric: 'tabular-nums'}}>{team.value}</text>
          </g>
        );
      })}
      <path d={`M${left + track} 2V${height - 2}`} stroke="var(--muted)" strokeWidth="2" strokeDasharray="1 6" strokeLinecap="round"/>
    </svg>
  );
}

/** 3·2·1 숫자. 움직임은 쓰는 쪽 CSS에서 주고, 움직임 줄이기 설정이면 멈춘다. */
export function CardCountdownDigit({value, size = 160}: {value: number; size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={String(value)}>
      <circle cx="80" cy="80" r="70" fill="var(--accent-soft)"/>
      <circle cx="80" cy="80" r="70" fill="none" stroke="var(--accent)" strokeWidth="6" strokeDasharray="4 13" strokeLinecap="round"/>
      <text x="80" y="115" textAnchor="middle" fontSize="102" fontWeight="800" fill="var(--accent-strong)">{value}</text>
    </svg>
  );
}

/** 많이 틀린 단어. 정렬은 쓰는 쪽에서 하지 않아도 되도록 오답률 높은 순으로 그린다. */
export function CardHardWordsChart({words, width = 480, limit = 6, copy = {title: '많이 틀린 단어', rate: '오답률', times: (count) => `${count}번`}}: {words: Array<{word: string; wrongRate: number; wrongCount: number}>; width?: number; limit?: number; copy?: {title: string; rate: string; times: (count: number) => string}}) {
  const rows = [...words].sort((a, b) => b.wrongRate - a.wrongRate).slice(0, limit);
  const rowHeight = 30;
  const height = rows.length * rowHeight + 4;
  const left = 112;
  const right = 92;
  const track = 480 - left - right;
  return (
    <svg width={width} height={width * height / 480} viewBox={`0 0 480 ${height}`} role="img" aria-label={`${copy.title}: ${rows.map((row) => `${row.word} ${Math.round(row.wrongRate)}%`).join(', ')}`}>
      {rows.map((row, index) => {
        const y = index * rowHeight + 4;
        const percent = clampPercent(row.wrongRate);
        return (
          <g key={row.word}>
            <title>{`${row.word}: ${copy.rate} ${Math.round(percent)}%, ${copy.times(row.wrongCount)}`}</title>
            <text x={left - 10} y={y + 13} textAnchor="end" fontSize="13" fontWeight="600" fill="var(--text)">{row.word}</text>
            <path d={`M${left} ${y + 18}h${track}`} stroke="var(--border)" strokeWidth="1"/>
            {percent > 0 && <rect x={left} y={y + 3} width={Math.max(4, track * percent / 100)} height="14" rx="4" fill="var(--coral)"/>}
            <text x={left + track + 10} y={y + 14} fontSize="12" fill="var(--text)" style={{fontVariantNumeric: 'tabular-nums'}}>{`${Math.round(percent)}%`}<tspan fill="var(--muted)">{` · ${copy.times(row.wrongCount)}`}</tspan></text>
          </g>
        );
      })}
    </svg>
  );
}

/** 완료·진행·미시작 학생 수 띠. 값이 0인 칸은 그리지 않는다. */
export function CardClassStatusBar({done, active, waiting, width = 480, copy = {done: '완료', active: '진행 중', waiting: '미시작', people: (count) => `${count}명`}}: {done: number; active: number; waiting: number; width?: number; copy?: {done: string; active: string; waiting: string; people: (count: number) => string}}) {
  const items = [
    {label: copy.done, value: done, fill: 'var(--accent)'},
    {label: copy.active, value: active, fill: 'var(--accent-soft)'},
    {label: copy.waiting, value: waiting, fill: 'var(--border)'},
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const gap = 2;
  const present = items.filter((item) => item.value > 0);
  const usable = 480 - gap * Math.max(present.length - 1, 0);
  let x = 0;
  return (
    <svg width={width} height={width * 52 / 480} viewBox="0 0 480 52" role="img" aria-label={items.map((item) => `${item.label} ${copy.people(item.value)}`).join(', ')}>
      {present.map((item) => {
        const segment = total ? usable * item.value / total : 0;
        const node = <rect key={item.label} x={x} y="0" width={segment} height="18" rx="4" fill={item.fill}><title>{`${item.label} ${copy.people(item.value)}`}</title></rect>;
        x += segment + gap;
        return node;
      })}
      {items.map((item, index) => (
        <g key={item.label} transform={`translate(${index * 112} 30)`}>
          <rect y="4" width="12" height="12" rx="3" fill={item.fill}/>
          <text x="18" y="15" fontSize="13" fill="var(--text)" style={{fontVariantNumeric: 'tabular-nums'}}>{`${item.label} ${copy.people(item.value)}`}</text>
        </g>
      ))}
    </svg>
  );
}

/** 점수 분포 작은 막대. bins는 낮은 점수부터 순서대로 넘긴다. */
export function CardScoreSpread({bins, target, width = 260}: {bins: Array<{label: string; count: number}>; target?: string; width?: number}) {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const plot = 70;
  const slot = 260 / Math.max(bins.length, 1);
  const bar = Math.min(slot - 2, 32);
  return (
    <svg width={width} height={width * 104 / 260} viewBox="0 0 260 104" role="img" aria-label={`점수 분포: ${bins.map((bin) => `${bin.label} ${bin.count}명`).join(', ')}`}>
      <path d={`M0 ${plot + 16}H260`} stroke="var(--border)" strokeWidth="1"/>
      {bins.map((bin, index) => {
        const h = bin.count ? Math.max(4, plot * bin.count / max) : 0;
        const x = index * slot + (slot - bar) / 2;
        return (
          <g key={bin.label}>
            <title>{`${bin.label}: ${bin.count}명`}</title>
            {h > 0 && <path d={`M${x} ${plot + 16}v${-(h - 4)}q0-4 4-4h${bar - 8}q4 0 4 4v${h - 4}Z`} fill={bin.label === target ? 'var(--accent)' : 'var(--accent-soft)'}/>}
            <text x={x + bar / 2} y={plot + 13 - h} textAnchor="middle" fontSize="11" fill="var(--text)" style={{fontVariantNumeric: 'tabular-nums'}}>{bin.count}</text>
            <text x={x + bar / 2} y="101" textAnchor="middle" fontSize="11" fill="var(--muted)">{bin.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
