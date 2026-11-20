import {LINK_PREVIEW} from '@/lib/berry-brand';
import type {Metadata} from 'next';
import Link from 'next/link';
import JsonLd from '@/modules/public-site/json-ld';
import {PUBLIC_SITE_INDEXABLE, SITE_NAME, SITE_URL} from '@/modules/public-site/site';
import {BlogBar, BlogStart, PostCard} from '@/modules/blog/blog-article';
import {postUrl} from '@/modules/blog/posts';
import {allPosts} from '@/modules/blog/store';
import {BLOG_NAME, SECTIONS} from '@/modules/blog/taxonomy';

export const revalidate = 600;

const description = '모두의 교실(ourclass, 교실.com) 블로그. 온라인 숙제, 학급 작품 전시실, AI 비서 베리 사용설명서와 숙제 검사·학급 경영·수업 준비를 줄이는 선생님 업무 Tip을 나눕니다.';

export const metadata: Metadata = {
  title: `${BLOG_NAME} · 사용설명서와 선생님 업무 Tip`,
  description,
  alternates: {canonical: '/blog', types: {'application/rss+xml': '/blog/rss.xml'}},
  openGraph: {title: BLOG_NAME, description, url: `${SITE_URL}/blog`, siteName: SITE_NAME, locale: 'ko_KR', type: 'website', images: [LINK_PREVIEW]},
  robots: {index: PUBLIC_SITE_INDEXABLE, follow: PUBLIC_SITE_INDEXABLE},
};

export default async function BlogHome() {
  const posts = await allPosts();
  return (
    <div className="ps bl">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'Blog', name: BLOG_NAME, description, url: `${SITE_URL}/blog`, inLanguage: 'ko-KR',
        publisher: {'@type': 'Organization', name: SITE_NAME, url: SITE_URL},
        blogPost: posts.slice(0, 30).map(p => ({'@type': 'BlogPosting', headline: p.title, url: postUrl(p), datePublished: p.published})),
      }}/>
      <BlogBar/>
      <div className="ps-wrap">
        <header className="ps-guide-hero">
          <nav className="ps-crumbs" aria-label="경로"><Link href="/">{SITE_NAME}</Link><span>›</span><span>블로그</span></nav>
          <h1>{BLOG_NAME}</h1>
          <p className="ps-lead">모두의 교실 사용설명서와 선생님 업무 Tip을 한곳에 모았습니다. 숙제 검사, 작품 전시, AI 비서 베리 활용까지 지금 바로 따라 할 수 있는 방법을 찾아보세요.</p>
        </header>
        <nav className="bl-tabs" aria-label="블로그 분류">
          <Link className="active" href="/blog" aria-current="page">전체</Link>
          {SECTIONS.map(s => <Link key={s.id} href={`/blog/${s.id}`}>{s.name}</Link>)}
        </nav>
        <section className="ps-catblock" aria-labelledby="latest">
          <h2 id="latest">최신 글</h2>
          <div className="ps-cardgrid">{posts.slice(0, 6).map(p => <PostCard key={p.slug} post={p}/>)}</div>
        </section>
        {SECTIONS.map(s => {
          const items = posts.filter(p => p.section === s.id);
          return (
            <section key={s.id} className="ps-catblock" aria-labelledby={`sec-${s.id}`}>
              <h2 id={`sec-${s.id}`}>{s.name} <small className="bl-count">{items.length}편</small></h2>
              <p>{s.blurb}</p>
              <nav className="ps-catnav" aria-label={`${s.name} 분류`}>
                {s.categories.map(c => <Link key={c.id} href={`/blog/${s.id}#${c.id}`}>{c.name}</Link>)}
              </nav>
              <div className="ps-cardgrid">{items.slice(0, 6).map(p => <PostCard key={p.slug} post={p}/>)}</div>
              <p className="bl-more"><Link className="ps-more" href={`/blog/${s.id}`}>{s.name} 전체 보기 →</Link></p>
            </section>
          );
        })}
        <BlogStart/>
      </div>
    </div>
  );
}
