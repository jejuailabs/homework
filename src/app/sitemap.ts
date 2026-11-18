import type {MetadataRoute} from 'next';
import {PUBLIC_SITE_INDEXABLE, SITE_URL} from '@/modules/public-site/site';
import {postUrl} from '@/modules/blog/posts';
import {allPosts} from '@/modules/blog/store';
import {SECTIONS} from '@/modules/blog/taxonomy';

// Rebuilt every 10 minutes so posts published from the admin menu are listed without a deploy.
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!PUBLIC_SITE_INDEXABLE) return [];
  const posts = await allPosts();
  const latest = posts.reduce((d, p) => (p.updated > d ? p.updated : d), '2026-11-18');
  return [
    {url: SITE_URL, lastModified: latest, changeFrequency: 'weekly', priority: 1},
    {url: `${SITE_URL}/blog`, lastModified: latest, changeFrequency: 'daily', priority: 0.9},
    ...SECTIONS.map(s => ({url: `${SITE_URL}/blog/${s.id}`, lastModified: latest, changeFrequency: 'daily' as const, priority: 0.85})),
    ...posts.map(p => ({
      url: postUrl(p),
      lastModified: p.updated,
      changeFrequency: 'monthly' as const,
      priority: p.category === 'start' ? 0.8 : 0.7,
    })),
  ];
}
