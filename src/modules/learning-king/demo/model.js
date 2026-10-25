(function (global) {
  'use strict';

  const myId = 'me';
  const questionCount = 5;
  const affiliations = [
    { region: '제주', crest: 'cloud', schools: ['구름초', '바람초', '오름초'] },
    { region: '부산', crest: 'shell', schools: ['산호초', '파도초', '바다초'] },
    { region: '서울', crest: 'star', schools: ['별빛초', '달빛초', '은하초'] },
    { region: '경기', crest: 'leaf', schools: ['새싹초', '나무초', '숲초'] }
  ];
  const classIds = ['4-1', '4-2', '4-3'];
  const characters = ['comet', 'moa', 'loop', 'popo'];
  const prefixes = ['반짝', '몽글', '파란', '초록', '노란', '보라', '바다', '하늘', '구름', '달빛', '새싹', '별빛', '산호', '노을', '은하', '솜솜', '두근', '포근', '초롱', '오로라', '바람', '햇살', '우주', '물결'];
  const friends = ['여우', '토끼', '펭귄', '고래', '고양이', '오리', '수달', '다람쥐', '판다', '참새', '사슴', '강아지'];
  const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

  function score(input) {
    const source = Array.isArray(input) ? input : [];
    const answers = Array.from({ length: questionCount }, (_, index) => {
      const item = source[index];
      if (!item) return { correct: false, seconds: 0 };
      const value = Number(item.seconds);
      return {
        correct: item.correct === true,
        seconds: Number.isFinite(value) && value >= 0 ? Math.min(value, 120) : 120
      };
    });
    const correct = answers.filter(answer => answer.correct).length;
    const totalSeconds = answers.reduce((total, answer) => total + answer.seconds, 0);
    const accuracyPoints = correct * 170;
    const speedPoints = answers.reduce((total, answer) => total + (answer.correct ? 30 * Math.max(0, Math.min(1, (20 - answer.seconds) / 17)) : 0), 0);
    return {
      answers,
      correct,
      totalSeconds: round2(totalSeconds),
      averageSeconds: round2(totalSeconds / questionCount),
      accuracy: correct * 20,
      accuracyPoints,
      speedPoints: round2(speedPoints),
      // Round the complete score once; never round each question's bonus.
      score: Math.round(accuracyPoints + speedPoints)
    };
  }

  function randomFor(text) {
    let seed = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      seed ^= text.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    return function () {
      seed += 0x6D2B79F5;
      let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function fictionalRecord(id, subject) {
    const random = randomFor('bomal-solo-demo-v1:' + id + ':' + subject);
    const draw = random();
    const correctCount = draw < 0.22 ? 3 : draw < 0.58 ? 4 : 5;
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const correctIndexes = new Set(order.slice(0, correctCount));
    return score(Array.from({ length: questionCount }, (_, i) => ({ correct: correctIndexes.has(i), seconds: Math.round((3 + random() * 16) * 10) / 10 })));
  }

  const roster = [];
  affiliations.forEach((affiliation, regionIndex) => {
    affiliation.schools.forEach((school, schoolIndex) => {
      classIds.forEach((classId, classIndex) => {
        for (let pupil = 0; pupil < 8; pupil += 1) {
          const index = roster.length;
          const isMe = regionIndex === 0 && schoolIndex === 0 && classIndex === 1 && pupil === 0;
          const id = isMe ? myId : 'p-' + regionIndex + '-' + schoolIndex + '-' + classIndex + '-' + pupil;
          const person = {
            id,
            name: isMe ? '별빛탐험가' : prefixes[index % prefixes.length] + friends[Math.floor(index / prefixes.length)],
            region: affiliation.region,
            school,
            classId,
            crest: affiliation.crest,
            character: isMe ? 'comet' : characters[index % characters.length],
            math: fictionalRecord(id, 'math'),
            english: fictionalRecord(id, 'english')
          };
          if (isMe) {
            person.math = score([7.3, 9.5, 10.1, 12.2, 13.7].map(seconds => ({ correct: true, seconds })));
            person.english = score([10, 12, 15, 11, 12].map(seconds => ({ correct: true, seconds })));
          }
          roster.push(person);
        }
      });
    });
  });

  function ranking(rows) {
    rows.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || a.averageSeconds - b.averageSeconds || a.id.localeCompare(b.id));
    rows.forEach((row, index) => {
      const previous = rows[index - 1];
      const tied = previous && row.score === previous.score && row.accuracy === previous.accuracy && row.averageSeconds === previous.averageSeconds;
      row.rank = tied ? previous.rank : index + 1;
    });
    return rows;
  }

  function boards(subject, overrideRecord) {
    const selectedSubject = subject === 'english' ? 'english' : 'math';
    const me = roster.find(person => person.id === myId);
    const override = overrideRecord && Array.isArray(overrideRecord.answers) ? score(overrideRecord.answers) : null;
    const records = roster.map(person => {
      const record = person.id === myId && override ? override : person[selectedSubject];
      return {
        id: person.id,
        name: person.name,
        region: person.region,
        school: person.school,
        classId: person.classId,
        crest: person.crest,
        character: person.character,
        score: record.score,
        correct: record.correct,
        accuracy: record.accuracy,
        totalSeconds: record.totalSeconds,
        averageSeconds: record.averageSeconds,
        accuracyPoints: record.accuracyPoints,
        speedPoints: record.speedPoints,
        count: 1,
        participants: 1,
        rosterCount: 1,
        isMe: person.id === myId,
        ours: person.id === myId
      };
    });
    const inSchool = person => person.region === me.region && person.school === me.school;
    const inClass = person => inSchool(person) && person.classId === me.classId;

    function makeBoard(id, title, kind, rows, context) {
      // A student appears on several boards; each board owns its rank values.
      const rankedRows = ranking(rows.map(row => ({ ...row })));
      const myRow = rankedRows.find(row => row.isMe || row.ours);
      return { id, title, kind, rows: rankedRows, myRow, myRank: myRow ? myRow.rank : null, count: rankedRows.length, unit: kind === 'individual' ? '점' : '평균점', context };
    }

    function aggregate(members, id, name, region, school, classId, crest) {
      const count = members.length;
      const mean = key => count ? members.reduce((sum, member) => sum + member[key], 0) / count : 0;
      return {
        id,
        name,
        region,
        school,
        classId,
        crest,
        character: null,
        score: Math.round(mean('score') * 10) / 10,
        accuracy: round2(mean('accuracy')),
        averageSeconds: round2(mean('averageSeconds')),
        totalSeconds: round2(mean('totalSeconds')),
        count,
        participants: count,
        rosterCount: count,
        schoolCount: new Set(members.map(member => member.region + ':' + member.school)).size,
        isMe: false,
        ours: members.some(member => member.isMe)
      };
    }

    const classRows = classIds.map(classId => aggregate(records.filter(person => inSchool(person) && person.classId === classId), 'class:' + me.region + ':' + me.school + ':' + classId, classId + '반', me.region, me.school, classId, me.crest));
    const localAffiliation = affiliations.find(item => item.region === me.region);
    const schoolRows = localAffiliation.schools.map(school => aggregate(records.filter(person => person.region === me.region && person.school === school), 'school:' + me.region + ':' + school, school, me.region, school, '', me.crest));
    const regionRows = affiliations.map(affiliation => aggregate(records.filter(person => person.region === affiliation.region), 'region:' + affiliation.region, affiliation.region, affiliation.region, '', '', affiliation.crest));
    return [
      makeBoard('class', '우리 반', 'individual', records.filter(inClass), me.school + ' ' + me.classId + ' · 8명'),
      makeBoard('school', '우리 학교', 'individual', records.filter(inSchool), me.school + ' 4학년 · 24명'),
      makeBoard('local', '제주 개인', 'individual', records.filter(person => person.region === me.region), me.region + ' 4학년 · 72명'),
      makeBoard('classes', '반 대항', 'group', classRows, me.school + ' · 반마다 8명 평균'),
      makeBoard('schools', '학교 대항', 'group', schoolRows, me.region + ' · 학교마다 24명 평균'),
      makeBoard('regions', '전국 지역 대항', 'group', regionRows, '4개 지역 · 지역마다 72명 평균')
    ];
  }

  const questions = {
    math: [
      { id: 'solo-m1', q: '238 + 146 = ?', answers: ['374', '384', '394'], correct: '384', explanation: '200 + 100 = 300, 38 + 46 = 84이므로 384예요.' },
      { id: 'solo-m2', q: '7 × 8 = ?', answers: ['54', '56', '64'], correct: '56', explanation: '7을 8번 더하면 56이에요.' },
      { id: 'solo-m3', q: '96 ÷ 8 = ?', answers: ['12', '14', '16'], correct: '12', explanation: '8 × 12 = 96이므로 몫은 12예요.' },
      { id: 'solo-m4', q: '420 − 175 = ?', answers: ['255', '235', '245'], correct: '245', explanation: '420에서 100, 70, 5를 차례로 빼면 245예요.' },
      { id: 'solo-m5', q: '24 × 3 = ?', answers: ['62', '72', '82'], correct: '72', explanation: '20 × 3 = 60, 4 × 3 = 12이므로 72예요.' }
    ],
    english: [
      { id: 'solo-e1', q: '“cloud”의 뜻은?', answers: ['구름', '바람', '파도'], correct: '구름', explanation: 'cloud는 하늘에 떠 있는 구름을 뜻해요.' },
      { id: 'solo-e2', q: '“친구”의 올바른 철자는?', answers: ['freind', 'friend', 'frend'], correct: 'friend', explanation: '친구는 f-r-i-e-n-d, friend라고 써요.' },
      { id: 'solo-e3', q: 'She ___ a blue bag.', answers: ['have', 'is', 'has'], correct: 'has', explanation: '주어가 She일 때 “가지고 있다”는 has를 써요.' },
      { id: 'solo-e4', q: '“작은”을 뜻하는 말은?', answers: ['tall', 'small', 'slow'], correct: 'small', explanation: 'small은 작은, tall은 키가 큰, slow는 느린이라는 뜻이에요.' },
      { id: 'solo-e5', q: '“나는 수영할 수 있어요.”는?', answers: ['I can swim.', 'I am swim.', 'I swim can.'], correct: 'I can swim.', explanation: '“할 수 있다”는 can을 동사 앞에 놓아 I can swim.이라고 해요.' }
    ]
  };

  global.SoloRank = { score, roster, boards, questions, affiliations, myId };
})(globalThis);
