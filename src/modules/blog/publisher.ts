import 'server-only';
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {aiProviderUsage, type AiProviderUsage} from '@/lib/ai-usage';
import {bucket, db} from '@/lib/server/admin';
import {AiError, completedAiText, providerFailure, readBoundedJson} from '@/lib/server/ai-policy';
import {ApiError} from '@/lib/server/policy';
import {buildArticleRequest, buildTopicsRequest, checkArticle, heroImagePrompt, parseArticle, parseTopics, squash, tidyArticle, type ArticleDraft, type CategoryRef, type TopicDraft, type WriterContext} from '@/lib/blog-writer';
import {SITE_ONE_LINER} from '@/modules/public-site/site';
import {KEYWORD_POOL} from './keywords';
import {postPath, type BlogPost} from './posts';
import {BLOG_COLLECTION, allPosts} from './store';
import {FEATURES, SECTIONS, categoryOf, isBlogSection, type BlogSectionId} from './taxonomy';

// Admin-only pipeline behind "검색 글 발행": weekly topic batches, one-click
// publish (article + hero image + SEO gate), and unpublish. Published posts are
// read by the public pages through ISR, so going live needs no code deploy.

export const TOPIC_COLLECTION = 'blogTopics';
const TEXT_MODEL = () => process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';
const IMAGE_MODEL = () => process.env.BLOG_IMAGE_MODEL?.trim() || 'gpt-image-2';
const LEASE_MS = 5 * 60_000;
const REPLY_BYTES = 2_000_000;
const IMAGE_BYTES = 12_000_000;

export type TopicStatus = 'proposed' | 'publishing' | 'published' | 'failed' | 'discarded';
export type TopicRow = TopicDraft & {id: string; status: TopicStatus; batch: string; createdAt: string; postSlug?: string; problems?: string[]; error?: string};
export type PostRow = {slug: string; title: string; section: string; category: string; status: string; published: string; path: string; image?: string; topicId?: string};

const seoulDay = (at = Date.now()) => new Date(at + 9 * 3600_000).toISOString().slice(0, 10);
/** ISO week label in Korean time, e.g. 2026-W47, used to group a weekly batch. */
export function weekLabel(at = Date.now()) {
  const d = new Date(at + 9 * 3600_000); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const allCategories = (): CategoryRef[] => SECTIONS.flatMap(s => s.categories.map(c => ({section: s.id, id: c.id, name: c.name, blurb: c.blurb})));
const featureRefs = () => Object.entries(FEATURES).map(([id, f]) => ({id, name: f.name, blurb: f.blurb}));

/** Usage lands in aiJobs like every other AI call, so "API 사용현황" shows the blog's cost. */
async function recordJob(uid: string, tool: string, model: string, startedAt: number, status: 'done' | 'failed', usage?: AiProviderUsage, code?: string) {
  try {
    await db().collection('aiJobs').add({actorUid: uid, classId: '', meteringVersion: 2, tool, model, status, code: code ?? null, createdAt: new Date(startedAt).toISOString(), startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, ...(usage ? {usage} : {})});
  } catch {console.error('[blog] usage record failed');}
}

async function openai(path: 'responses' | 'images/generations', body: unknown, timeoutMs: number, maxBytes: number) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AiError(503, 'AI 연결 설정을 확인해 주세요.', 'AI_NOT_CONFIGURED');
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(`https://api.openai.com/v1/${path}`, {method: 'POST', headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal, cache: 'no-store'});
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[blog] provider ${path} ${response.status}`, detail.slice(0, 300));
      throw providerFailure(response.status);
    }
    return await readBoundedJson(response, maxBytes);
  } catch (error) {
    if (signal.aborted) throw new AiError(504, 'AI 응답이 늦어지고 있어요. 다시 시도해 주세요.', 'AI_TIMEOUT');
    if (error instanceof ApiError) throw error;
    throw new AiError(503, 'AI 서비스에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'AI_UNAVAILABLE');
  }
}

/** One metered structured call: the reply text parsed as JSON. */
async function structured(uid: string, tool: string, body: {model: string}, timeoutMs: number): Promise<unknown> {
  const startedAt = Date.now();
  let usage: AiProviderUsage | undefined;
  try {
    const payload = await openai('responses', body, timeoutMs, REPLY_BYTES);
    usage = aiProviderUsage(payload, body.model);
    const value = JSON.parse(completedAiText(payload));
    await recordJob(uid, tool, body.model, startedAt, 'done', usage);
    return value;
  } catch (error) {
    await recordJob(uid, tool, body.model, startedAt, 'failed', usage, error instanceof ApiError ? error.code : 'AI_INVALID_RESPONSE');
    if (error instanceof ApiError) throw error;
    throw new AiError(502, 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.', 'AI_INVALID_RESPONSE');
  }
}

// ───────────────────────────── topics ─────────────────────────────

const topicRef = (id: string) => db().collection(TOPIC_COLLECTION).doc(id);

function toTopic(id: string, d: Record<string, unknown>): TopicRow {
  return {
    id, title: String(d.title ?? ''), section: d.section === 'tips' ? 'tips' : 'manual', category: String(d.category ?? ''), keyword: String(d.keyword ?? ''), angle: String(d.angle ?? ''),
    status: (['proposed', 'publishing', 'published', 'failed', 'discarded'].includes(String(d.status)) ? d.status : 'proposed') as TopicStatus,
    batch: String(d.batch ?? ''), createdAt: String(d.createdAt ?? ''),
    ...(d.postSlug ? {postSlug: String(d.postSlug)} : {}), ...(Array.isArray(d.problems) ? {problems: d.problems.map(String)} : {}), ...(d.error ? {error: String(d.error)} : {}),
  };
}

async function knownTitles() {
  const [posts, topics] = await Promise.all([allPosts(), db().collection(TOPIC_COLLECTION).orderBy('createdAt', 'desc').limit(400).get()]);
  return [...posts.map(p => p.title), ...topics.docs.map(d => String(d.data().title ?? ''))].filter(Boolean);
}

/** Asks for a fresh batch of 20 titles (10 manual, 10 tips) and stores them as proposals. */
export async function generateTopics(uid: string, source: 'admin' | 'cron' = 'admin') {
  const titles = await knownTitles();
  const used = new Set(titles.map(squash));
  const pool = KEYWORD_POOL.filter(k => ![...used].some(t => t.includes(squash(k))));
  const categories = allCategories();
  const value = await structured(uid, 'blog-topics', buildTopicsRequest(TEXT_MODEL(), {categories, existingTitles: titles, keywordPool: pool.length >= 10 ? pool : KEYWORD_POOL, features: featureRefs()}), 120_000);
  const topics = parseTopics(value, categories, titles);
  if (!topics.length) throw new AiError(502, '새 제목을 만들지 못했어요. 다시 시도해 주세요.', 'BLOG_TOPICS_EMPTY');
  const batch = weekLabel(), now = new Date().toISOString(), writes = db().batch();
  topics.forEach((t, i) => writes.set(db().collection(TOPIC_COLLECTION).doc(), {...t, status: 'proposed', batch, source, order: i, createdAt: now, createdBy: uid}));
  await writes.commit();
  return {created: topics.length, batch};
}

export async function addTopic(uid: string, input: Record<string, unknown>) {
  const title = String(input.title ?? '').trim(), keyword = String(input.keyword ?? '').trim(), section = String(input.section ?? ''), category = String(input.category ?? '');
  if (title.length < 8 || title.length > 60) throw new ApiError(400, '제목은 8~60자로 적어 주세요.', 'BLOG_TOPIC_TITLE');
  if (keyword.length < 2 || keyword.length > 30) throw new ApiError(400, '핵심 검색어를 2~30자로 적어 주세요.', 'BLOG_TOPIC_KEYWORD');
  if (!isBlogSection(section) || !categoryOf(section, category)) throw new ApiError(400, '분류를 다시 골라 주세요.', 'BLOG_TOPIC_CATEGORY');
  const ref = await db().collection(TOPIC_COLLECTION).add({title, keyword, section, category, angle: String(input.angle ?? '').trim().slice(0, 200) || title, status: 'proposed', batch: weekLabel(), source: 'manual', order: 99, createdAt: new Date().toISOString(), createdBy: uid});
  return {id: ref.id};
}

export async function discardTopic(id: string) {
  await db().runTransaction(async tx => {
    const snap = await tx.get(topicRef(id));
    if (!snap.exists) throw new ApiError(404, '제목을 찾을 수 없어요.', 'NOT_FOUND');
    if (['publishing', 'published'].includes(String(snap.data()?.status))) throw new ApiError(409, '발행 중이거나 발행된 제목은 버릴 수 없어요.', 'BLOG_TOPIC_STATE');
    tx.update(snap.ref, {status: 'discarded', updatedAt: new Date().toISOString()});
  });
  return {ok: true};
}

// ───────────────────────────── publish ─────────────────────────────

/** Product facts for the writer: same-category posts first, then the guides of the features it names. */
export function writerContext(topic: TopicDraft, posts: BlogPost[]): WriterContext {
  const category = categoryOf(topic.section as BlogSectionId, topic.category);
  const manualSlugs = new Set((category?.features ?? []).map(f => FEATURES[f].manual));
  const sources = [
    ...posts.filter(p => p.section === topic.section && p.category === topic.category),
    ...posts.filter(p => manualSlugs.has(p.slug)),
  ].filter((p, i, list) => list.findIndex(x => x.slug === p.slug) === i).slice(0, 5);
  const facts = sources.map(p => [`# ${p.title}`, p.summary, ...p.sections.flatMap(s => [`## ${s.heading}`, ...s.body, ...(s.steps ?? []).map((t, i) => `${i + 1}. ${t}`)])].join('\n')).join('\n\n');
  return {siteOneLiner: SITE_ONE_LINER, features: featureRefs(), posts: posts.map(p => ({slug: p.slug, title: p.title, summary: p.summary.slice(0, 120)})), facts};
}

async function writeArticle(uid: string, topic: TopicDraft, posts: BlogPost[]) {
  const category = allCategories().find(c => c.section === topic.section && c.id === topic.category)!;
  const ctx = writerContext(topic, posts);
  const knownSlugs = new Set(posts.map(p => p.slug));
  const takenSnap = await db().collection(BLOG_COLLECTION).select().get();
  const takenSlugs = new Set([...knownSlugs, ...takenSnap.docs.map(d => d.id)]);
  const opts = {takenSlugs, knownSlugs, featureIds: new Set(Object.keys(FEATURES))};
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = parseArticle(await structured(uid, 'blog-article', buildArticleRequest(TEXT_MODEL(), topic, category, ctx, problems), 170_000));
    if (!draft) {problems = ['응답 형식이 맞지 않습니다.']; continue;}
    if (takenSlugs.has(draft.slug)) draft.slug = `${draft.slug}-${randomUUID().slice(0, 4)}`;
    problems = checkArticle(draft, topic, opts);
    if (!problems.length) return tidyArticle(draft, knownSlugs);
  }
  throw Object.assign(new ApiError(422, '검색 기준을 통과하지 못해 발행하지 않았어요.', 'BLOG_SEO_GATE'), {problems});
}

/** Generates the hero image and stores it in Firebase Storage under a permanent public download link. */
async function heroImage(uid: string, d: ArticleDraft): Promise<{src: string; alt: string} | null> {
  const model = IMAGE_MODEL(), startedAt = Date.now();
  let usage: AiProviderUsage | undefined;
  try {
    const payload = await openai('images/generations', {model, prompt: heroImagePrompt(d.imagePrompt), n: 1, size: '1536x1024', quality: 'medium', output_format: 'webp', output_compression: 82}, 150_000, IMAGE_BYTES) as {data?: {b64_json?: string}[]};
    usage = aiProviderUsage(payload, model);
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) throw new AiError(502, '이미지를 받지 못했어요.', 'BLOG_IMAGE_EMPTY');
    const bytes = Buffer.from(b64, 'base64'), token = randomUUID(), path = `blog/hero/${d.slug}-${token.slice(0, 8)}.webp`;
    await bucket().file(path).save(bytes, {resumable: false, contentType: 'image/webp', metadata: {cacheControl: 'public, max-age=31536000, immutable', metadata: {firebaseStorageDownloadTokens: token}}});
    await recordJob(uid, 'blog-image', model, startedAt, 'done', usage);
    return {src: `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`, alt: d.imageAlt};
  } catch (error) {
    // A missing picture never blocks the article: the page falls back to the feature's screen preview.
    await recordJob(uid, 'blog-image', model, startedAt, 'failed', usage, error instanceof ApiError ? error.code : 'BLOG_IMAGE_FAILED');
    console.error('[blog] hero image failed', error instanceof Error ? error.message : error);
    return null;
  }
}

function refreshPublicPages(section: string, slug: string) {
  for (const path of ['/blog', `/blog/${section}`, `/blog/${section}/${slug}`, '/sitemap.xml', '/blog/rss.xml', '/llms.txt']) revalidatePath(path);
}

export async function publishTopic(uid: string, id: string) {
  const now = Date.now(), lease = randomUUID();
  const topic = await db().runTransaction(async tx => {
    const snap = await tx.get(topicRef(id));
    if (!snap.exists) throw new ApiError(404, '제목을 찾을 수 없어요.', 'NOT_FOUND');
    const d = snap.data()!;
    if (d.status === 'published') throw new ApiError(409, '이미 발행한 제목이에요.', 'BLOG_TOPIC_STATE');
    if (d.status === 'discarded') throw new ApiError(409, '버린 제목은 발행할 수 없어요.', 'BLOG_TOPIC_STATE');
    if (d.status === 'publishing' && Number(d.leaseUntil) > now) throw new ApiError(409, '이 제목은 지금 글을 쓰고 있어요. 잠시 뒤 확인해 주세요.', 'BLOG_TOPIC_BUSY');
    tx.update(snap.ref, {status: 'publishing', lease, leaseUntil: now + LEASE_MS, error: null, problems: null, updatedAt: new Date(now).toISOString()});
    return toTopic(snap.id, d);
  });
  try {
    if (!categoryOf(topic.section, topic.category)) throw new ApiError(400, '분류가 올바르지 않아요.', 'BLOG_TOPIC_CATEGORY');
    const posts = await allPosts();
    const article = await writeArticle(uid, topic, posts);
    const hero = await heroImage(uid, article);
    const day = seoulDay(), feature = article.features[0] as keyof typeof FEATURES;
    const post = {
      status: 'published', slug: article.slug, section: topic.section, category: topic.category,
      title: article.title, seoTitle: article.seoTitle, description: article.description, summary: article.summary, keywords: article.keywords, minutes: article.minutes,
      hero: hero ?? {mock: FEATURES[feature]?.mock ?? 'dashboard', alt: article.imageAlt},
      sections: article.sections.map(s => ({heading: s.heading, body: s.body, ...(s.steps.length ? {steps: s.steps} : {}), ...(s.tip ? {tip: s.tip} : {})})),
      faq: article.faq, related: article.related, features: article.features,
      published: day, updated: day, topicId: id, keyword: topic.keyword, model: TEXT_MODEL(), imageModel: hero ? IMAGE_MODEL() : null,
      createdAt: new Date().toISOString(), createdBy: uid,
    };
    await db().collection(BLOG_COLLECTION).doc(article.slug).create(post);
    await topicRef(id).update({status: 'published', postSlug: article.slug, leaseUntil: 0, publishedAt: new Date().toISOString()});
    refreshPublicPages(topic.section, article.slug);
    return {slug: article.slug, path: postPath({section: topic.section, slug: article.slug}), image: !!hero};
  } catch (error) {
    const problems = (error as {problems?: string[]}).problems;
    await topicRef(id).update({status: 'failed', leaseUntil: 0, error: error instanceof ApiError ? error.message : '글을 만들지 못했어요.', ...(problems ? {problems} : {}), updatedAt: new Date().toISOString()}).catch(() => {});
    throw error;
  }
}

export async function setPostStatus(slug: string, status: 'published' | 'unpublished') {
  const ref = db().collection(BLOG_COLLECTION).doc(slug);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, '글을 찾을 수 없어요.', 'NOT_FOUND');
  await ref.update({status, updatedStatusAt: new Date().toISOString()});
  refreshPublicPages(String(snap.data()?.section), slug);
  return {ok: true};
}

export async function blogAdminState() {
  const [topics, posts] = await Promise.all([
    db().collection(TOPIC_COLLECTION).orderBy('createdAt', 'desc').limit(120).get(),
    db().collection(BLOG_COLLECTION).orderBy('createdAt', 'desc').limit(100).get(),
  ]);
  const today = seoulDay();
  const postRows: PostRow[] = posts.docs.map(doc => {
    const d = doc.data(), section = String(d.section);
    return {slug: doc.id, title: String(d.title ?? ''), section, category: String(d.category ?? ''), status: String(d.status ?? ''), published: String(d.published ?? ''), path: `/blog/${section}/${doc.id}`, ...(d.hero?.src ? {image: String(d.hero.src)} : {}), ...(d.topicId ? {topicId: String(d.topicId)} : {})};
  });
  return {
    topics: topics.docs.map(doc => toTopic(doc.id, doc.data())).filter(t => t.status !== 'discarded'),
    posts: postRows,
    publishedToday: postRows.filter(p => p.published === today && p.status === 'published').length,
    categories: allCategories(),
    week: weekLabel(),
  };
}
