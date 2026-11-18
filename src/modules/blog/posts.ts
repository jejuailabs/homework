import {GUIDES} from '@/modules/public-site/guides';
import {SITE_URL} from '@/modules/public-site/site';
import type {Guide} from '@/modules/public-site/types';
import {categoryOf, type BlogSectionId, type FeatureId} from './taxonomy';

/** One blog article. The 47 hand-written guides and AI-published posts share this shape. */
export type BlogPost = Omit<Guide, 'category'> & {
  section: BlogSectionId;
  category: string;
  /** First publish date (YYYY-MM-DD). `updated` is the last edit. */
  published: string;
  /** Feature cards shown beside the article; falls back to the category's features. */
  features?: FeatureId[];
  source: 'static' | 'db';
};

// The insight column guides read as teacher-work tips, so they move to that section.
const INSIGHT_TO_TIPS: Record<string, string> = {
  'ai-classroom-guide': 'ai-use',
  'edutech-tools-comparison': 'column',
  'homework-feedback-tips': 'homework-eval',
  'class-management-ideas': 'class-mgmt',
  'student-portfolio': 'class-mgmt',
  'padlet-classcard-alternative': 'column',
};

export const STATIC_POSTS: BlogPost[] = GUIDES.map(g => {
  const tips = g.category === 'insight';
  return {
    ...g,
    section: tips ? 'tips' : 'manual',
    category: tips ? (INSIGHT_TO_TIPS[g.slug] ?? 'column') : g.category,
    published: g.updated,
    source: 'static',
  };
});

/** Old /guide/{slug} addresses that now live in the tips section (used for redirects). */
export const INSIGHT_SLUGS = Object.keys(INSIGHT_TO_TIPS);

export function postPath(p: Pick<BlogPost, 'section' | 'slug'>) {
  return `/blog/${p.section}/${p.slug}`;
}

export function postUrl(p: Pick<BlogPost, 'section' | 'slug'>) {
  return `${SITE_URL}${postPath(p)}`;
}

export function staticPostBySlug(slug: string) {
  return STATIC_POSTS.find(p => p.slug === slug);
}

export function featuresOf(p: BlogPost): FeatureId[] {
  return p.features?.length ? p.features : categoryOf(p.section, p.category)?.features ?? ['homework', 'berry'];
}

/** Newest first; hand-written guides keep their file order within a date. */
export function sortPosts(posts: BlogPost[]) {
  return [...posts].sort((a, b) => b.published.localeCompare(a.published));
}
