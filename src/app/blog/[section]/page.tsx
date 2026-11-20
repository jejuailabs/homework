import {LINK_PREVIEW} from '@/lib/berry-brand';
import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import JsonLd from '@/modules/public-site/json-ld';
import {PUBLIC_SITE_INDEXABLE, SITE_NAME, SITE_URL} from '@/modules/public-site/site';
import {BlogBar, BlogStart, PostCard} from '@/modules/blog/blog-article';
import {postUrl} from '@/modules/blog/posts';
import {allPosts} from '@/modules/blog/store';
import {BLOG_NAME, SECTIONS, sectionById} from '@/modules/blog/taxonomy';

export const revalidate = 600;
export const dynamicParams = false;

export function generateStaticParams() {
  return SECTIONS.map(s => ({section: s.id}));
}

type Params = Promise<{section: string}>;

export async function generateMetadata({params}: {params: Params}): Promise<Metadata> {
  const s = sectionById((await params).section);
  if (!s) return {};
  const title = `${s.title} · ${SITE_NAME}`;
  return {
    title,
    description: s.blurb,
    alternates: {canonical: `/blog/${s.id}`},
    openGraph: {title, description: s.blurb, url: `${SITE_URL}/blog/${s.id}`, siteName: SITE_NAME, locale: 'ko_KR', type: 'website', images: [LINK_PREVIEW]},
    robots: {index: PUBLIC_SITE_INDEXABLE, follow: PUBLIC_SITE_INDEXABLE},
  };
}

export default async function BlogSectionPage({params}: {params: Params}) {
  const s = sectionById((await params).section);
  if (!s) notFound();
  const posts = (await allPosts()).filter(p => p.section === s.id);
  const groups = s.categories.map(c => ({...c, items: posts.filter(p => p.category === c.id)})).filter(c => c.items.length);
  return (
    <div className="ps bl">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: s.title, description: s.blurb, url: `${SITE_URL}/blog/${s.id}`, inLanguage: 'ko-KR',
        isPartOf: {'@type': 'Blog', name: BLOG_NAME, url: `${SITE_URL}/blog`},
        hasPart: posts.map(p => ({'@type': s.id === 'manual' ? 'TechArticle' : 'BlogPosting', headline: p.title, url: postUrl(p)})),
      }}/>
      <BlogBar/>
      <div className="ps-wrap">
        <header className="ps-guide-hero">
          <nav className="ps-crumbs" aria-label="경로"><Link href="/">{SITE_NAME}</Link><span>›</span><Link href="/blog">블로그</Link><span>›</span><span>{s.name}</span></nav>
          <h1>{s.title}</h1>
          <p className="ps-lead">{s.blurb}</p>
        </header>
        <nav className="bl-tabs" aria-label="블로그 분류">
          <Link href="/blog">전체</Link>
          {SECTIONS.map(x => <Link key={x.id} className={x.id === s.id ? 'active' : undefined} aria-current={x.id === s.id ? 'page' : undefined} href={`/blog/${x.id}`}>{x.name}</Link>)}
        </nav>
        <nav className="ps-catnav" aria-label={`${s.name} 분류`}>{groups.map(c => <a key={c.id} href={`#${c.id}`}>{c.name} <small>{c.items.length}</small></a>)}</nav>
        {groups.map(c => (
          <section key={c.id} id={c.id} className="ps-catblock" aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`}>{c.name}</h2><p>{c.blurb}</p>
            <div className="ps-cardgrid">{c.items.map(p => <PostCard key={p.slug} post={p}/>)}</div>
          </section>
        ))}
        <BlogStart/>
      </div>
    </div>
  );
}
