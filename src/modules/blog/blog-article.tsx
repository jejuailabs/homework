import Link from 'next/link';
import LoginScreen from '@/components/login-screen';
import JsonLd from '@/modules/public-site/json-ld';
import Mockup from '@/modules/public-site/mockups';
import VisualBlock from '@/modules/public-site/visual';
import {SITE_NAME, SITE_URL} from '@/modules/public-site/site';
import {featuresOf, postPath, postUrl, type BlogPost} from './posts';
import {BLOG_NAME, FEATURES, categoryOf, sectionById, type FeatureId} from './taxonomy';

const anchor = (i: number) => `s${i + 1}`;
const absolute = (src: string) => (src.startsWith('http') ? src : `${SITE_URL}${src}`);

export function postJsonLd(p: BlogPost) {
  const url = postUrl(p), section = sectionById(p.section)!, category = categoryOf(p.section, p.category);
  const graph: unknown[] = [
    {
      '@type': p.section === 'manual' ? 'TechArticle' : 'BlogPosting',
      '@id': `${url}#article`,
      headline: p.title,
      description: p.description,
      inLanguage: 'ko-KR',
      datePublished: p.published,
      dateModified: p.updated,
      keywords: p.keywords.join(', '),
      articleSection: category?.name ?? section.name,
      author: {'@type': 'Organization', name: `${SITE_NAME} 팀`, url: SITE_URL},
      publisher: {'@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icons/app-512.png`},
      mainEntityOfPage: url,
      image: 'src' in p.hero ? absolute(p.hero.src) : `${SITE_URL}/icons/app-512.png`,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL},
        {'@type': 'ListItem', position: 2, name: '블로그', item: `${SITE_URL}/blog`},
        {'@type': 'ListItem', position: 3, name: section.name, item: `${SITE_URL}/blog/${section.id}`},
        {'@type': 'ListItem', position: 4, name: p.title, item: url},
      ],
    },
  ];
  const howto = p.sections.find(s => s.steps?.length);
  if (howto) graph.push({'@type': 'HowTo', name: howto.heading, inLanguage: 'ko-KR', step: howto.steps!.map((text, i) => ({'@type': 'HowToStep', position: i + 1, text}))});
  if (p.faq.length) graph.push({'@type': 'FAQPage', mainEntity: p.faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}}))});
  return {'@context': 'https://schema.org', '@graph': graph};
}

/** Slim bar at the top of every blog page: what ourclass is, and the way in. */
export function BlogBar() {
  return (
    <div className="bl-bar">
      <div className="bl-bar-inner">
        <p><b>{SITE_NAME}</b><span>숙제 · 작품 전시 · AI 비서 베리를 한곳에서</span></p>
        <nav aria-label="시작하기">
          <a className="bl-btn ghost" href="#start">학생 입장</a>
          <a className="bl-btn" href="#start">선생님 시작하기</a>
        </nav>
      </div>
    </div>
  );
}

function FeatureCallout({id}: {id: FeatureId}) {
  const f = FEATURES[id];
  return (
    <aside className="bl-callout" aria-label={`${f.name} 미리보기`}>
      <div>
        <small>모두의 교실 기능</small>
        <b>{f.name}</b>
        <p>{f.blurb}</p>
        <div className="bl-callout-actions">
          <a className="bl-btn" href="#start">바로 써 보기</a>
          <Link className="bl-link" href={postPath({section: 'manual', slug: f.manual})}>사용법 보기 →</Link>
        </div>
      </div>
      <Mockup id={f.mock}/>
    </aside>
  );
}

/** The sign-in card, under its own heading so the article keeps a single h1. */
export function BlogStart() {
  return (
    <section id="start" className="bl-start" aria-labelledby="start-title">
      <div>
        <h2 id="start-title">모두의 교실에서 바로 시작하기</h2>
        <p>선생님은 Google 계정으로, 학생은 선생님이 준 숫자 6자리 입장 코드로 들어옵니다. 숙제, 작품 전시, AI 비서 베리, 수업 활동을 한곳에서 쓸 수 있습니다.</p>
        <ul>
          <li>설치 없이 웹에서 바로 사용</li>
          <li>학생은 이메일 계정 없이 입장 코드로 참여</li>
          <li>보호자는 선생님이 연 링크·QR로 결과물만 확인</li>
        </ul>
      </div>
      <LoginScreen compact autoRedirect={false} defaultTab="teacher"/>
    </section>
  );
}

export function PostCard({post}: {post: BlogPost}) {
  const category = categoryOf(post.section, post.category);
  return (
    <Link className="ps-card bl-card" href={postPath(post)}>
      {'src' in post.hero && <img src={post.hero.src} alt="" loading="lazy" decoding="async"/>}
      <small>{category?.name ?? sectionById(post.section)?.name}</small>
      <b>{post.title}</b>
      <p>{post.description}</p>
    </Link>
  );
}

export default function BlogArticle({post: p, related}: {post: BlogPost; related: BlogPost[]}) {
  const section = sectionById(p.section)!, category = categoryOf(p.section, p.category);
  const features = featuresOf(p);
  return (
    <article className="ps bl">
      <JsonLd data={postJsonLd(p)}/>
      <BlogBar/>
      <div className="ps-wrap">
        <header className="ps-guide-hero">
          <nav className="ps-crumbs" aria-label="경로">
            <Link href="/">{SITE_NAME}</Link><span>›</span><Link href="/blog">블로그</Link><span>›</span>
            <Link href={`/blog/${section.id}`}>{section.name}</Link>
            {category && <><span>›</span><Link href={`/blog/${section.id}#${category.id}`}>{category.name}</Link></>}
          </nav>
          <span className="ps-tag">{category?.name ?? section.name}</span>
          <h1>{p.title}</h1>
          <div className="ps-meta">
            <span>{SITE_NAME} 팀</span>
            <span>읽는 시간 {p.minutes}분</span>
            <span>작성 <time dateTime={p.published}>{p.published}</time></span>
            {p.updated !== p.published && <span>업데이트 <time dateTime={p.updated}>{p.updated}</time></span>}
          </div>
        </header>
        <div className="ps-article">
          <div className="ps-body">
            <p className="ps-answer"><b>핵심 요약</b>{p.summary}</p>
            <VisualBlock visual={p.hero} priority/>
            {p.sections.map((s, i) => (
              <section key={s.heading} aria-labelledby={anchor(i)}>
                <h2 id={anchor(i)}>{s.heading}</h2>
                {s.body.map(t => <p key={t.slice(0, 40)}>{t}</p>)}
                {s.steps && <ol className="ps-howto">{s.steps.map(t => <li key={t}>{t}</li>)}</ol>}
                {s.tip && <p className="ps-tip"><b>팁</b>{s.tip}</p>}
                {s.visual && <VisualBlock visual={s.visual}/>}
                {i === 1 && <FeatureCallout id={features[0]}/>}
              </section>
            ))}
            {p.faq.length > 0 && (
              <section aria-labelledby="faq">
                <h2 id="faq">자주 묻는 질문</h2>
                <div className="ps-faq">{p.faq.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
              </section>
            )}
            <section aria-labelledby="features">
              <h2 id="features">이 글에 나온 모두의 교실 기능</h2>
              <div className="bl-features">
                {features.map(id => (
                  <div key={id} className="bl-feature">
                    <b>{FEATURES[id].name}</b>
                    <p>{FEATURES[id].blurb}</p>
                    <Link className="bl-link" href={postPath({section: 'manual', slug: FEATURES[id].manual})}>사용법 →</Link>
                  </div>
                ))}
              </div>
            </section>
            <BlogStart/>
            {related.length > 0 && (
              <section aria-labelledby="more">
                <h2 id="more">함께 읽으면 좋은 글</h2>
                <div className="ps-cardgrid">{related.map(r => <PostCard key={r.slug} post={r}/>)}</div>
              </section>
            )}
            {p.keywords.length > 0 && <div className="ps-kw" aria-label="관련 키워드">{p.keywords.map(k => <span key={k}>#{k}</span>)}</div>}
          </div>
          <aside className="ps-toc" aria-label="목차">
            <b>목차</b>
            <ol>
              {p.sections.map((s, i) => <li key={s.heading}><a href={`#${anchor(i)}`}>{s.heading}</a></li>)}
              {p.faq.length > 0 && <li><a href="#faq">자주 묻는 질문</a></li>}
              <li><a href="#start">바로 시작하기</a></li>
            </ol>
            <div className="bl-toc-cta">
              <small>{BLOG_NAME}</small>
              <p>{FEATURES[features[0]].name}, 지금 우리 반에서 써 보세요.</p>
              <a className="bl-btn" href="#start">시작하기</a>
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}
