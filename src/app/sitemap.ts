import type {MetadataRoute} from 'next';
import {GUIDES} from '@/modules/public-site/guides';
import {PUBLIC_SITE_INDEXABLE, SITE_URL} from '@/modules/public-site/site';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!PUBLIC_SITE_INDEXABLE) return [];
  const latest = GUIDES.reduce((d, g) => (g.updated > d ? g.updated : d), '2026-11-11');
  return [
    {url: SITE_URL, lastModified: latest, changeFrequency: 'weekly', priority: 1},
    {url: `${SITE_URL}/guide`, lastModified: latest, changeFrequency: 'weekly', priority: 0.9},
    ...GUIDES.map(g => ({
      url: `${SITE_URL}/guide/${g.slug}`,
      lastModified: g.updated,
      changeFrequency: 'monthly' as const,
      priority: g.category === 'start' ? 0.8 : 0.7,
    })),
  ];
}
