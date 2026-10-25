(function (global) {
  'use strict';

  // Original, deterministic exercises. No AI, network, clock job, or paid service is used.
  const VERSION = 1;
  const GRADE_LABELS = Object.freeze(['', '1학년', '2학년', '3학년', '4학년', '5학년', '6학년']);
  const LEVEL_LABELS = Object.freeze({ gentle: '차근차근', standard: '한 걸음 더' });
  const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a) || 1;
  const rational = (n, d = 1) => {
    const divisor = gcd(n, d);
    return [n / divisor, d / divisor];
  };
  const asPair = value => Array.isArray(value) ? rational(value[0], value[1]) : [value, 1];
  const plus = (a, b) => rational(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  const minus = (a, b) => rational(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
  const times = (a, b) => rational(a[0] * b[0], a[1] * b[1]);
  const dividedBy = (a, b) => rational(a[0] * b[1], a[1] * b[0]);

  function format(value, kind = 'integer') {
    const [n, d] = asPair(value);
    if (d === 1) return String(n);
    if (kind === 'decimal') {
      // All decimal templates use tenths/hundredths; integer arithmetic avoids float artifacts.
      const hundredths = n * (100 / d);
      if (Number.isInteger(hundredths)) {
        return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`.replace(/0+$/, '');
      }
    }
    return `${n}/${d}`;
  }

  function seededRandom(text) {
    let seed = 2166136261;
    for (let i = 0; i < text.length; i += 1) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
    return () => {
      seed += 0x6D2B79F5;
      let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  const shuffle = (items, random) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const other = Math.floor(random() * (i + 1));
      [result[i], result[other]] = [result[other], result[i]];
    }
    return result;
  };

  function answerFor(operation, values) {
    if (operation === 'add') return values.reduce(plus, [0, 1]);
    if (operation === 'subtract') return minus(values[0], values[1]);
    if (operation === 'multiply') return values.reduce(times, [1, 1]);
    if (operation === 'divide') return dividedBy(values[0], values[1]);
    if (operation === 'average') return dividedBy(values.reduce(plus, [0, 1]), [values.length, 1]);
    if (operation === 'percent') return times(dividedBy(values[0], values[1]), [100, 1]);
    if (operation === 'max') return values.reduce((a, b) => a[0] * b[1] > b[0] * a[1] ? a : b);
    throw new Error('알 수 없는 문제 유형입니다.');
  }

  function make(random, skill, q, operation, operands, explanation, options = {}) {
    const values = operands.map(asPair);
    const value = answerFor(operation, values);
    const kind = options.kind || 'integer';
    const correct = format(value, kind);
    const answers = new Set([correct]);
    if (options.choices) options.choices.forEach(choice => answers.add(format(choice, kind)));
    const step = asPair(options.step || 1);
    for (const offset of shuffle([-1, 1, -2, 2, 3], random)) {
      if (answers.size >= 3) break;
      const candidate = plus(value, times(step, [offset, 1]));
      if (candidate[0] >= 0 && (options.maximum === undefined || candidate[0] <= options.maximum * candidate[1])) answers.add(format(candidate, kind));
    }
    return {
      q, skill, answers: shuffle([...answers].slice(0, 3), random), correct,
      explanation: typeof explanation === 'function' ? explanation(correct) : explanation,
      // Exact operands support audits without executing or trusting the explanation text.
      math: { operation, values, format: kind }
    };
  }

  function context(grade, level, random) {
    const easy = level === 'gentle';
    return {
      grade, easy, random,
      int: (min, max) => min + Math.floor(random() * (max - min + 1)),
      pick: items => items[Math.floor(random() * items.length)]
    };
  }

  const templates = {
    addition(c) {
      const maximum = c.grade === 1 ? (c.easy ? 9 : 19) : c.grade === 2 ? (c.easy ? 49 : 149) : c.grade === 3 ? (c.easy ? 199 : 499) : 999;
      const a = c.int(1, maximum), b = c.int(1, c.grade === 1 ? maximum + 1 - a : maximum);
      return make(c.random, '덧셈', `${a} + ${b} = ?`, 'add', [a, b], answer => `두 수를 합해요. ${a} + ${b} = ${answer}입니다.`);
    },
    subtraction(c) {
      const maximum = c.grade === 1 ? (c.easy ? 10 : 20) : c.grade === 2 ? (c.easy ? 99 : 299) : c.grade === 3 ? 999 : 1999;
      const a = c.int(2, maximum), b = c.int(1, a);
      return make(c.random, '뺄셈', `${a} − ${b} = ?`, 'subtract', [a, b], answer => `남은 수를 구해요. ${a} − ${b} = ${answer}입니다.`);
    },
    missing(c) {
      const maximum = c.grade === 1 ? (c.easy ? 10 : 20) : c.grade === 2 ? 99 : 199;
      const sum = c.int(3, maximum), a = c.int(1, sum - 1);
      return make(c.random, '빈칸 찾기', `${a} + □ = ${sum}\n□에 알맞은 수는?`, 'subtract', [sum, a], answer => `합에서 알고 있는 수를 빼요. ${sum} − ${a} = ${answer}입니다.`);
    },
    comparison(c) {
      const maximum = c.grade === 1 ? (c.easy ? 20 : 50) : 999;
      const start = c.int(1, maximum - 7), values = shuffle([start, start + c.int(1, 3), start + c.int(4, 7)], c.random);
      return make(c.random, '크기 비교', `${values.join(', ')}\n가장 큰 수는?`, 'max', values, answer => `세 수 중 가장 큰 수는 ${answer}입니다.`, { choices: values });
    },
    sequence(c) {
      const step = c.grade === 1 ? (c.easy ? 1 : c.pick([1, 2])) : c.pick([2, 5, 10]);
      const start = c.int(1, c.grade === 1 ? 15 : 70);
      return make(c.random, '수의 규칙', `${start}, ${start + step}, ${start + 2 * step}, □\n다음 수는?`, 'add', [start, 3 * step], answer => `${step}씩 커지는 규칙이에요. 다음 수는 ${answer}입니다.`);
    },
    collection(c) {
      const maximum = c.grade === 1 ? (c.easy ? 5 : 9) : c.grade === 2 ? 35 : 150;
      const a = c.int(1, maximum), b = c.int(1, maximum), item = c.pick(['별 조각', '조약돌', '구슬', '스티커']);
      return make(c.random, '모으기 이야기', `${item} ${a}개를 가지고 있어요.\n${b}개를 더 모으면 모두 몇 개일까요?`, 'add', [a, b], answer => `처음 가진 ${a}개와 더 모은 ${b}개를 더하면 ${answer}개예요.`);
    },
    groups(c) {
      const size = c.int(2, c.grade === 2 && c.easy ? 5 : 9), groups = c.int(2, 9);
      const item = c.pick(['사과', '구슬', '별 조각']);
      return make(c.random, '같은 수 묶기', `한 상자에 ${item} ${size}개씩 담았어요.\n${groups}상자에는 모두 몇 개일까요?`, 'multiply', [size, groups], answer => `${size}개씩 ${groups}묶음이므로 ${size} × ${groups} = ${answer}개예요.`);
    },
    multiplication(c) {
      const a = c.int(c.grade <= 2 ? 2 : 11, c.grade <= 2 ? 9 : c.grade === 3 || c.easy ? 39 : 79);
      const b = c.int(2, c.grade >= 4 && !c.easy ? 19 : 9);
      return make(c.random, '곱셈', `${a} × ${b} = ?`, 'multiply', [a, b], answer => `같은 수를 ${b}번 더한 값이에요. ${a} × ${b} = ${answer}입니다.`);
    },
    sharing(c) {
      const groups = c.int(2, 9), each = c.int(2, c.grade <= 3 ? 9 : 35), total = groups * each;
      return make(c.random, '똑같이 나누기', `쿠키 ${total}개를 ${groups}명에게 똑같이 나눠요.\n한 명이 받는 쿠키는 몇 개일까요?`, 'divide', [total, groups], answer => `${total} ÷ ${groups} = ${answer}입니다. 한 명에게 ${answer}개씩 줘요.`);
    },
    division(c) {
      const b = c.int(2, c.grade >= 4 && !c.easy ? 19 : 9), quotient = c.int(2, c.grade <= 3 ? 9 : 45);
      return make(c.random, '나눗셈', `${b * quotient} ÷ ${b} = ?`, 'divide', [b * quotient, b], answer => `${b} × ${answer} = ${b * quotient}입니다. 따라서 몫은 ${answer}입니다.`);
    },
    place(c) {
      const tens = c.int(1, 9), units = c.int(0, 9);
      return make(c.random, '자릿값', `10이 ${tens}개, 1이 ${units}개인 수는?`, 'add', [tens * 10, units], answer => `십의 자리와 일의 자리를 합해요. ${tens * 10} + ${units} = ${answer}입니다.`);
    },
    money(c) {
      const total = c.int(5, c.grade <= 2 ? 10 : 40) * 100, cost = c.int(1, total / 100 - 1) * 100;
      return make(c.random, '돈 계산', `${total}원으로 ${cost}원짜리 공책을 샀어요.\n남은 돈은 몇 원일까요?`, 'subtract', [total, cost], answer => `${total} − ${cost} = ${answer}입니다. ${answer}원이 남아요.`, { step: 100, maximum: total });
    },
    time(c) {
      const hour = c.int(1, 10), start = c.pick([0, 5, 10, 15, 20]), elapsed = c.pick([5, 10, 15, 20, 25]);
      return make(c.random, '시간 더하기', `${hour}시 ${start}분에서 ${elapsed}분 뒤는\n${hour}시 몇 분일까요?`, 'add', [start, elapsed], answer => `${start}분에 ${elapsed}분을 더하면 ${hour}시 ${answer}분이에요.`, { step: 5, maximum: 59 });
    },
    length(c) {
      const meters = c.int(1, c.easy ? 5 : 12), centimeters = c.int(1, 9) * 10;
      return make(c.random, '길이 바꾸기', `${meters} m ${centimeters} cm는\n모두 몇 cm일까요?`, 'add', [meters * 100, centimeters], answer => `1 m는 100 cm예요. ${meters * 100} + ${centimeters} = ${answer} cm예요.`, { step: 10 });
    },
    tile(c) {
      const rows = c.int(2, 9), columns = c.int(3, c.easy ? 9 : 15);
      return make(c.random, '바닥 채우기', `한 줄에 타일 ${columns}개를 놓았어요.\n${rows}줄을 채우는 데 필요한 타일은 몇 개일까요?`, 'multiply', [columns, rows], answer => `한 줄의 개수와 줄 수를 곱해요. ${columns} × ${rows} = ${answer}개예요.`);
    },
    likeFraction(c) {
      // Prime denominators and a proper sum avoid requiring later-grade reduction skills.
      const denominator = c.pick([3, 5, 7, 11]), a = c.int(1, denominator - 2), b = c.int(1, denominator - 1 - a);
      return make(c.random, '같은 분모의 분수', `${a}/${denominator} + ${b}/${denominator} = ?`, 'add', [[a, denominator], [b, denominator]], answer => `분모는 그대로 두고 분자를 더해요. 분자는 ${a} + ${b} = ${a + b}이고 답은 ${answer}입니다.`, { kind: 'fraction', step: [1, denominator] });
    },
    unlikeFraction(c) {
      const small = c.int(2, 6), big = small * c.int(2, 3), a = c.int(1, small - 1), b = c.int(1, big - 1);
      return make(c.random, '분수 더하기', `${a}/${small} + ${b}/${big} = ?`, 'add', [[a, small], [b, big]], answer => `공통 분모 ${big}에 맞춰 통분한 뒤 분자를 더해요. 약분한 답은 ${answer}입니다.`, { kind: 'fraction', step: [1, big] });
    },
    fractionTimes(c) {
      const denominator = c.int(2, 10), numerator = c.int(1, denominator - 1), count = c.int(2, 7);
      return make(c.random, '분수의 곱셈', `${numerator}/${denominator} × ${count} = ?`, 'multiply', [[numerator, denominator], count], answer => `분자와 자연수를 곱하면 ${numerator} × ${count} = ${numerator * count}입니다. 약분한 답은 ${answer}입니다.`, { kind: 'fraction', step: [1, denominator] });
    },
    fractionDivide(c) {
      const denominator = c.int(2, 9), numerator = c.int(1, denominator - 1), count = c.int(2, 6);
      return make(c.random, '분수의 나눗셈', `${numerator}/${denominator} ÷ ${count} = ?`, 'divide', [[numerator, denominator], count], answer => `자연수로 나누려면 그 수의 역수를 곱해요. 약분한 답은 ${answer}입니다.`, { kind: 'fraction', step: [1, denominator * count] });
    },
    decimalAdd(c) {
      const a = c.int(1, 89), b = c.int(1, 59);
      return make(c.random, '소수 더하기', `${format([a, 10], 'decimal')} + ${format([b, 10], 'decimal')} = ?`, 'add', [[a, 10], [b, 10]], answer => `소수점을 맞추어 더해요. 답은 ${answer}입니다.`, { kind: 'decimal', step: [1, 10] });
    },
    decimalTimes(c) {
      const a = c.int(2, 49), b = c.int(2, 8);
      return make(c.random, '소수의 곱셈', `${format([a, 10], 'decimal')} × ${b} = ?`, 'multiply', [[a, 10], b], answer => `먼저 ${a} × ${b} = ${a * b}입니다. 다시 10으로 나눈 답은 ${answer}입니다.`, { kind: 'decimal', step: [1, 10] });
    },
    decimalDivide(c) {
      const quotient = c.int(1, 39), divisor = c.int(2, 8);
      return make(c.random, '소수의 나눗셈', `${format([quotient * divisor, 10], 'decimal')} ÷ ${divisor} = ?`, 'divide', [[quotient * divisor, 10], divisor], answer => `먼저 ${quotient * divisor} ÷ ${divisor} = ${quotient}입니다. 다시 10으로 나눈 답은 ${answer}입니다.`, { kind: 'decimal', step: [1, 10] });
    },
    area(c) {
      const width = c.int(3, 18), height = c.int(2, 12);
      return make(c.random, '직사각형의 넓이', `가로 ${width} cm, 세로 ${height} cm인\n직사각형의 넓이는 몇 cm²일까요?`, 'multiply', [width, height], answer => `직사각형의 넓이는 가로 × 세로이므로 ${width} × ${height} = ${answer} cm²예요.`);
    },
    average(c) {
      const center = c.int(5, 40), difference = c.int(1, 4), values = shuffle([center - difference, center, center + difference], c.random);
      return make(c.random, '평균 구하기', `세 날 동안 읽은 책의 쪽 수가\n${values.join(', ')}쪽이에요. 하루 평균 몇 쪽일까요?`, 'average', values, answer => `쪽 수를 모두 더하고 3으로 나누면 하루 평균 ${answer}쪽이에요.`);
    },
    percentage(c) {
      const total = c.pick([20, 40, 50, 100]), percent = c.pick([10, 20, 30, 40, 50, 60, 70, 80, 90]), part = total * percent / 100;
      return make(c.random, '백분율', `구슬 ${total}개 중 파란 구슬이 ${part}개예요.\n파란 구슬은 전체의 몇 %일까요?`, 'percent', [part, total], answer => `(${part} ÷ ${total}) × 100 = ${answer}입니다. 따라서 ${answer}%예요.`, { step: 10, maximum: 100 });
    }
  };

  // Broad bands deliberately mix familiar skills; these are not a full curriculum schedule.
  const catalog = {
    1: { gentle: ['addition', 'subtraction', 'missing', 'comparison', 'sequence', 'collection'], standard: ['addition', 'subtraction', 'missing', 'comparison', 'sequence', 'collection'] },
    2: { gentle: ['addition', 'subtraction', 'missing', 'sequence', 'collection', 'place', 'comparison'], standard: ['addition', 'subtraction', 'groups', 'multiplication', 'place', 'money', 'time'] },
    3: { gentle: ['addition', 'subtraction', 'groups', 'multiplication', 'place', 'money', 'time'], standard: ['addition', 'subtraction', 'multiplication', 'sharing', 'division', 'length', 'time', 'tile'] },
    4: { gentle: ['addition', 'subtraction', 'multiplication', 'sharing', 'division', 'length', 'tile', 'money'], standard: ['multiplication', 'division', 'likeFraction', 'decimalAdd', 'length', 'tile', 'time', 'money'] },
    5: { gentle: ['multiplication', 'division', 'likeFraction', 'decimalAdd', 'length', 'tile', 'money'], standard: ['unlikeFraction', 'fractionTimes', 'decimalTimes', 'area', 'average', 'division', 'money'] },
    6: { gentle: ['unlikeFraction', 'fractionTimes', 'decimalTimes', 'area', 'average', 'division', 'money'], standard: ['fractionDivide', 'fractionTimes', 'unlikeFraction', 'decimalDivide', 'percentage', 'area', 'average'] }
  };

  function dateKey(now = new Date()) {
    const date = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(date.getTime())) throw new Error('날짜를 확인해 주세요.');
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function normalizeDate(value) {
    const date = value === undefined ? dateKey() : value;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜를 확인해 주세요.');
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('날짜를 확인해 주세요.');
    return date;
  }

  function generate(input = {}) {
    const grade = Number(input.grade === undefined ? 3 : input.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) throw new Error('1~6학년 중에서 골라 주세요.');
    const level = input.level === undefined ? 'gentle' : input.level;
    if (!Object.hasOwn(LEVEL_LABELS, level)) throw new Error('난도를 확인해 주세요.');
    const sequence = input.sequence === undefined ? 0 : input.sequence;
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('여행 차수를 확인해 주세요.');
    const count = input.count === undefined ? 20 : input.count;
    if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('문제 수는 1~60개로 정해 주세요.');
    const date = normalizeDate(input.date);
    const id = `journey-v${VERSION}-${date}-g${grade}-${level}-${sequence}`;
    const random = seededRandom(id), c = context(grade, level, random);
    const deck = shuffle(catalog[grade][level], random);
    const recent = new Set(Array.isArray(input.seen) ? input.seen.filter(item => typeof item === 'string').slice(-5000) : []);
    const used = new Set(), questions = [];
    // Bounded retries keep even an exhausted early-grade bank responsive. A recent repeat
    // is preferable to an empty journey, but a question never repeats within this journey.
    for (let attempt = 0; attempt < 12000 && questions.length < count; attempt += 1) {
      const question = templates[deck[questions.length % deck.length]](c);
      if (used.has(question.q) || (attempt < 2500 && recent.has(question.q))) continue;
      used.add(question.q);
      questions.push({ id: `${id}-q${questions.length + 1}`, ...question });
    }
    if (questions.length !== count) throw new Error('새 여행을 준비하지 못했어요. 다시 시작해 주세요.');
    return { id, grade, level, date, sequence, questions };
  }

  function score(input, total = 20) {
    const count = Number.isInteger(total) && total > 0 ? total : 20;
    const answers = (Array.isArray(input) ? input : []).slice(0, count);
    const correct = answers.filter(item => item && item.correct === true).length;
    const totalSeconds = answers.reduce((sum, item) => {
      const seconds = Number(item && item.seconds);
      return sum + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 24 * 60 * 60) : 0);
    }, 0);
    const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
    const points = Math.round(correct / count * 1000);
    return { score: points, correct, accuracy: round2(correct / count * 100), totalSeconds: round2(totalSeconds), averageSeconds: round2(totalSeconds / count), accuracyPoints: points, speedPoints: 0 };
  }

  global.MathJourney = Object.freeze({ VERSION, GRADE_LABELS, LEVEL_LABELS, generate, score, dateKey });
})(globalThis);
