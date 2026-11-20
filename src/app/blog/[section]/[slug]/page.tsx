import {LINK_PREVIEW} from '@/lib/berry-brand';
import type {Metadata} from 'next';
import {notFound, permanentRedirect} from 'next/navigation';
import {PUBLIC_SITE_INDEXABLE, SITE_NAME} from '@/modules/public-site/site';
import BlogArticle from '@/modules/blog/blog-article';
import {STATIC_POSTS, postPath, postUrl, type BlogPost} from '@/modules/blog/posts';
import {allPosts, postBySlug} from '@/modules/blog/store';

// Hand-written guides are built ahead; posts published from the admin menu render on first visit.
export const revalidate = 600;
export const dynamicParams = true;

export function generateStaticParams() {
  return STATIC_POSTS.map(p => ({section: p.section, slug: p.slug}));
}

type Params = Promise<{section: string; slug: string}>;

export async function generateMetadata({params}: {params: Params}): Promise<Metadata> {
  const p = await postBySlug((await params).slug);
  if (!p) return {};
  const title = `${p.seoTitle ?? p.title} · ${SITE_NAME}`;
  const image = 'src' in p.hero ? p.hero.src : LINK_PREVIEW;
  return {
    title,
    description: p.description,
    keywords: p.keywords,
    alternates: {canonical: postPath(p)},
    openGraph: {title, description: p.description, url: postUrl(p), siteName: SITE_NAME, locale: 'ko_KR', type: 'article', publishedTime: p.published, modifiedTime: p.updated, images: [image]},
    robots: {index: PUBLIC_SITE_INDEXABLE, follow: PUBLIC_SITE_INDEXABLE},
  };
}

function relatedPosts(p: BlogPost, all: BlogPost[]) {
  const others = all.filter(x => x.slug !== p.slug);
  const picked = p.related.map(s => others.find(x => x.slug === s)).filter((x): x is BlogPost => !!x);
  const same = others.filter(x => x.category === p.category && !picked.includes(x));
  const section = others.filter(x => x.section === p.section && !picked.includes(x) && !same.includes(x));
  return [...picked, ...same, ...section].slice(0, 6);
}

export default async function BlogPostPage({params}: {params: Params}) {
  const {section, slug} = await params;
  const p = await postBySlug(slug);
  if (!p) notFound();
  if (p.section !== section) permanentRedirect(postPath(p));
  return <BlogArticle post={p} related={relatedPosts(p, await allPosts())}/>;
}
