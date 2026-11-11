import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import GuideArticle from '@/modules/public-site/guide-article';
import {GUIDES, guideBySlug} from '@/modules/public-site/guides';
import {PUBLIC_SITE_INDEXABLE, SITE_NAME, SITE_URL} from '@/modules/public-site/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map(g => ({slug: g.slug}));
}

export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  const title = `${g.seoTitle ?? g.title} · ${SITE_NAME}`;
  const image = 'src' in g.hero ? g.hero.src : '/icons/app-512.png';
  return {
    title,
    description: g.description,
    keywords: g.keywords,
    alternates: {canonical: `/guide/${g.slug}`},
    openGraph: {title, description: g.description, url: `${SITE_URL}/guide/${g.slug}`, siteName: SITE_NAME, locale: 'ko_KR', type: 'article', modifiedTime: g.updated, images: [image]},
    robots: {index: PUBLIC_SITE_INDEXABLE, follow: PUBLIC_SITE_INDEXABLE},
  };
}

export default async function GuidePage({params}: {params: Promise<{slug: string}>}) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  return <GuideArticle guide={g}/>;
}
