import type {Metadata} from 'next';
import Link from 'next/link';
import JsonLd from '@/modules/public-site/json-ld';
import {GUIDES} from '@/modules/public-site/guides';
import {CATEGORIES, PUBLIC_SITE_INDEXABLE, SITE_NAME, SITE_URL} from '@/modules/public-site/site';

const description = '모두의 교실(ourclass) 사용 가이드. 온라인 숙제 관리, 학급 작품 전시실, AI 비서 베리, 참여보드·학급 투표·단어 카드 등 모든 기능의 사용법과 학급 운영 노하우를 정리했습니다.';

export const metadata: Metadata = {
  title: '사용 가이드 · 모두의 교실 (ourclass)',
  description,
  alternates: {canonical: '/guide'},
  openGraph: {title: '모두의 교실 사용 가이드', description, url: `${SITE_URL}/guide`, siteName: SITE_NAME, locale: 'ko_KR', type: 'website'},
  robots: {index: PUBLIC_SITE_INDEXABLE, follow: PUBLIC_SITE_INDEXABLE},
};

export default function GuideHub() {
  const groups = CATEGORIES.map(c => ({...c, items: GUIDES.filter(g => g.category === c.id)})).filter(c => c.items.length);
  return (
    <div className="ps">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: '모두의 교실 사용 가이드', description, url: `${SITE_URL}/guide`, inLanguage: 'ko-KR',
        hasPart: GUIDES.map(g => ({'@type': 'TechArticle', headline: g.title, url: `${SITE_URL}/guide/${g.slug}`})),
      }}/>
      <div className="ps-wrap">
        <header className="ps-guide-hero">
          <nav className="ps-crumbs" aria-label="경로"><Link href="/">{SITE_NAME}</Link><span>›</span><span>사용 가이드</span></nav>
          <h1>모두의 교실 사용 가이드</h1>
          <p className="ps-lead">숙제 내기부터 작품 전시, AI 비서 베리, 수업 활동과 학급 경영까지. 선생님이 실제로 묻는 질문 순서대로 {GUIDES.length}편의 글로 정리했습니다.</p>
        </header>
        <nav className="ps-catnav" aria-label="분류">{groups.map(c => <a key={c.id} href={`#${c.id}`}>{c.name} <small>{c.items.length}</small></a>)}</nav>
        {groups.map(c => (
          <section key={c.id} id={c.id} className="ps-catblock">
            <h2>{c.name}</h2><p>{c.blurb}</p>
            <div className="ps-cardgrid">
              {c.items.map(g => (
                <Link key={g.slug} className="ps-card" href={`/guide/${g.slug}`}><small>{g.minutes}분 읽기</small><b>{g.title}</b><p>{g.description}</p></Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
