import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArticleRequest, checkArticle, parseArticle, parseTopics, tidyArticle, type ArticleDraft, type CategoryRef, type TopicDraft} from './blog-writer';

const topic: TopicDraft = {title: '온라인 숙제 검사 빠르게 하는 법', section: 'manual', category: 'homework', keyword: '온라인 숙제 검사', angle: '한 명씩 확인하기로 숙제를 검사하는 방법'};
const known = new Set(['a-guide', 'b-guide', 'c-guide', 'd-guide']);
const opts = {takenSlugs: new Set(['taken-slug']), knownSlugs: known, featureIds: new Set(['homework', 'berry'])};
const para = '선생님이 온라인 숙제 검사를 할 때는 제출 상태를 먼저 보고, 한 명씩 확인하며 짧은 말씀을 남기면 시간이 줄어듭니다. 아이들은 확인 표시를 보고 다음 숙제를 더 꼼꼼하게 준비합니다. 같은 기준으로 보면 반 전체의 흐름도 한눈에 보입니다. ' + '확인한 기록은 학기 말 정리에도 그대로 쓰이고, 보호자 상담 때 근거 자료가 됩니다. 모두의 교실에서 처음에는 낯설어도 두세 번 해 보면 금방 익숙해집니다.';
const good = (): ArticleDraft => ({
  slug: 'online-homework-check',
  title: '온라인 숙제 검사, 한 명씩 확인하기로 빠르게 끝내는 방법',
  seoTitle: '온라인 숙제 검사 빠르게 하는 5단계',
  description: '온라인 숙제 검사를 한 명씩 확인하기로 빠르게 끝내는 방법을 정리했습니다. 제출 상태 보기부터 선생님 말씀 남기기, 다시 제출 요청까지 단계별로 안내합니다.',
  summary: '온라인 숙제 검사는 제출 상태를 먼저 보고 한 명씩 확인하며 말씀을 남기면 가장 빠릅니다.',
  keywords: ['온라인 숙제 검사', '숙제 검사', '숙제 피드백', '온라인 숙제', '모두의 교실'],
  minutes: 6,
  sections: [
    {heading: '온라인 숙제 검사는 왜 오래 걸릴까요?', body: [para, para], steps: [], tip: ''},
    {heading: '온라인 숙제 검사 5단계 따라하기', body: [para], steps: ['숙제를 엽니다.', '제출 상태를 봅니다.', '한 명씩 확인합니다.'], tip: '확인 순서를 정해 두세요.'},
    {heading: '말씀 남기기 요령', body: [para, para, para], steps: [], tip: ''},
    {heading: '다시 제출 요청하기', body: [para, para, para], steps: [], tip: ''},
    {heading: '반 전체 흐름 보기', body: [para, para, para], steps: [], tip: ''},
  ],
  faq: [
    {q: '숙제 검사는 몇 분 걸리나요?', a: '반 인원과 제출 형태에 따라 다르지만 한 명씩 확인하기로 보면 넘기는 시간이 줄어듭니다.'},
    {q: '다시 제출을 요청할 수 있나요?', a: '확인 화면에서 다시 제출 요청을 누르면 학생 화면에 안내가 표시됩니다.'},
    {q: '말씀은 나중에 고칠 수 있나요?', a: '남긴 말씀은 같은 화면에서 다시 열어 고칠 수 있습니다.'},
    {q: '보호자도 볼 수 있나요?', a: '보호자는 선생님이 열어 준 링크나 QR로 결과물만 볼 수 있습니다.'},
  ],
  related: ['a-guide', 'b-guide', 'c-guide', 'unknown-guide'],
  features: ['homework', 'berry'],
  imagePrompt: 'A teacher at a desk checking homework on a laptop while children wave from a bright classroom.',
  imageAlt: '선생님이 노트북으로 온라인 숙제 검사를 하는 교실 그림',
});

test('a well-formed manual article passes the SEO gate', () => {
  assert.deepEqual(checkArticle(good(), topic, opts), []);
});

test('the gate rejects missing keyword, short body, taken slugs, banned claims and markup', () => {
  const d = good();
  d.slug = 'taken-slug';
  d.seoTitle = '숙제를 빠르게 확인하는 다섯 가지 방법';
  d.description = d.description.replace(/온라인 숙제 검사/g, '숙제 확인');
  d.sections = d.sections.slice(0, 3).map(s => ({...s, body: ['짧은 문단입니다. 모두의 교실은 무료입니다.']}));
  d.faq[0].a = '**굵게** 설명합니다. https://example.com 에서 확인하세요.';
  const problems = checkArticle(d, topic, opts).join('\n');
  for (const part of ['이미 쓰고', '검색 제목 앞부분', '설명에 핵심', '소제목은', '본문은 공백', '근거 없는 표현', '마크다운']) assert.match(problems, new RegExp(part));
});

test('manual articles need numbered steps; tips articles do not', () => {
  const d = good();
  d.sections = d.sections.map(s => ({...s, steps: []}));
  assert.ok(checkArticle(d, topic, opts).some(p => p.includes('따라하기')));
  assert.ok(!checkArticle(d, {...topic, section: 'tips', category: 'homework-eval'}, opts).some(p => p.includes('따라하기')));
});

test('tidyArticle keeps only known related slugs and clamps reading time', () => {
  const d = tidyArticle({...good(), minutes: 40}, known);
  assert.deepEqual(d.related, ['a-guide', 'b-guide', 'c-guide']);
  assert.equal(d.minutes, 15);
});

test('parseTopics drops unknown categories, duplicates and existing titles', () => {
  const categories: CategoryRef[] = [{section: 'manual', id: 'homework', name: '숙제', blurb: ''}, {section: 'tips', id: 'homework-eval', name: '숙제·평가', blurb: ''}];
  const topics = parseTopics({topics: [
    {title: '온라인 숙제 내는 법 따라하기', section: 'manual', category: 'homework', keyword: '온라인 숙제', angle: 'a'},
    {title: '온라인 숙제 내는 법 따라하기', section: 'manual', category: 'homework', keyword: '숙제 내기', angle: 'b'},
    {title: '숙제 검사 어려우시죠? 시간 줄이는 3가지', section: 'tips', category: 'homework-eval', keyword: '온라인 숙제', angle: 'c'},
    {title: '학급 전시회 여는 방법 총정리', section: 'manual', category: 'exhibition', keyword: '학급 전시회', angle: 'd'},
    {title: '이미 있는 제목입니다 정말로', section: 'tips', category: 'homework-eval', keyword: '숙제 피드백', angle: 'e'},
  ]}, categories, ['이미 있는 제목입니다 정말로']);
  assert.deepEqual(topics.map(t => t.title), ['온라인 숙제 내는 법 따라하기']);
  assert.deepEqual(parseTopics({nope: true}, categories, []), []);
});

test('parseArticle rejects off-shape replies and the request carries the retry reasons', () => {
  assert.equal(parseArticle({slug: 'x'}), null);
  assert.ok(parseArticle(good()));
  const request = buildArticleRequest('m', topic, {section: 'manual', id: 'homework', name: '숙제', blurb: ''}, {siteOneLiner: 's', features: [], posts: [], facts: ''}, ['제목이 짧습니다']);
  assert.match(request.instructions, /제목이 짧습니다/);
  assert.equal(request.text.format.strict, true);
});
