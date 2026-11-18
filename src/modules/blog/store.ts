import 'server-only';
import {cache} from 'react';
import {db} from '@/lib/server/admin';
import {STATIC_POSTS, sortPosts, type BlogPost} from './posts';
import {categoryOf, isBlogSection} from './taxonomy';

// Published posts written from the admin menu live in Firestore `blogPosts`.
// Pages read them at render time (ISR), so a publish needs no code deploy.
export const BLOG_COLLECTION = 'blogPosts';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const str = (v: unknown, max = 20000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const strList = (v: unknown) => Array.isArray(v) && v.every(x => str(x));

/** Keeps a malformed document from breaking a public page: anything off-shape is skipped. */
export function toPost(id: string, d: Record<string, unknown>): BlogPost | null {
  const section = d.section, category = d.category;
  if (d.status !== 'published' || typeof section !== 'string' || !isBlogSection(section) || typeof category !== 'string' || !categoryOf(section, category)) return null;
  if (!SLUG.test(String(d.slug ?? id)) || !str(d.title, 120) || !str(d.description, 300) || !str(d.summary, 600)) return null;
  const sections = Array.isArray(d.sections) ? d.sections.filter(s => s && str((s as {heading?: unknown}).heading, 120) && strList((s as {body?: unknown}).body)) : [];
  if (!sections.length) return null;
  const hero = d.hero as {src?: unknown; alt?: unknown} | undefined;
  return {
    slug: String(d.slug ?? id),
    section,
    category,
    title: String(d.title),
    seoTitle: str(d.seoTitle, 80) ? String(d.seoTitle) : undefined,
    description: String(d.description),
    keywords: strList(d.keywords) ? (d.keywords as string[]).slice(0, 12) : [],
    summary: String(d.summary),
    audience: ['teacher'],
    minutes: typeof d.minutes === 'number' ? d.minutes : 5,
    published: str(d.published, 10) ? String(d.published) : String(d.updated ?? '2026-11-18'),
    updated: str(d.updated, 10) ? String(d.updated) : String(d.published ?? '2026-11-18'),
    hero: hero && str(hero.src, 1000) && String(hero.src).startsWith('https://') && str(hero.alt, 300)
      ? {src: String(hero.src), alt: String(hero.alt)}
      : {mock: 'dashboard', alt: String(d.title)},
    sections: sections as BlogPost['sections'],
    faq: Array.isArray(d.faq) ? (d.faq as {q?: unknown; a?: unknown}[]).filter(f => str(f.q, 300) && str(f.a, 1500)) as BlogPost['faq'] : [],
    related: strList(d.related) ? (d.related as string[]) : [],
    features: strList(d.features) ? (d.features as BlogPost['features']) : undefined,
    source: 'db',
  };
}

async function loadDbPosts(): Promise<BlogPost[]> {
  try {
    const snap = await db().collection(BLOG_COLLECTION).where('status', '==', 'published').get();
    const taken = new Set(STATIC_POSTS.map(p => p.slug));
    return snap.docs.map(doc => toPost(doc.id, doc.data())).filter((p): p is BlogPost => !!p && !taken.has(p.slug));
  } catch (error) {
    // A Firestore outage (or a build without credentials) still serves the hand-written guides.
    console.error('[blog] published posts unavailable', error instanceof Error ? error.message : error);
    return [];
  }
}

/** Every public post, newest first. Cached per request. */
export const allPosts = cache(async () => sortPosts([...STATIC_POSTS, ...await loadDbPosts()]));

export async function postBySlug(slug: string) {
  return (await allPosts()).find(p => p.slug === slug);
}
