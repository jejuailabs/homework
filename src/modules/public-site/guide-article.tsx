import Link from 'next/link';
import JsonLd from './json-ld';
import VisualBlock from './visual';
import {GUIDES, guideBySlug} from './guides';
import {SITE_NAME, SITE_URL, categoryName} from './site';
import type {Guide} from './types';

const audienceName = {teacher: '선생님', student: '학생', parent: '보호자'} as const;

function anchor(i: number) { return `s${i + 1}`; }

export function guideJsonLd(g: Guide) {
  const url = `${SITE_URL}/guide/${g.slug}`;
  const graph: unknown[] = [
    {
      '@type': 'TechArticle',
      '@id': `${url}#article`,
      headline: g.title,
      description: g.description,
      inLanguage: 'ko-KR',
      dateModified: g.updated,
      datePublished: g.updated,
      keywords: g.keywords.join(', '),
      about: categoryName(g.category),
      author: {'@type': 'Organization', name: SITE_NAME, url: SITE_URL},
      publisher: {'@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icons/app-512.png`},
      mainEntityOfPage: url,
      ...('src' in g.hero ? {image: `${SITE_URL}${g.hero.src}`} : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL},
        {'@type': 'ListItem', position: 2, name: '사용 가이드', item: `${SITE_URL}/guide`},
        {'@type': 'ListItem', position: 3, name: g.title, item: url},
      ],
    },
  ];
  const howto = g.sections.find(s => s.steps?.length);
  if (howto) graph.push({
    '@type': 'HowTo',
    name: howto.heading,
    inLanguage: 'ko-KR',
    step: howto.steps!.map((text, i) => ({'@type': 'HowToStep', position: i + 1, text})),
  });
  if (g.faq.length) graph.push({
    '@type': 'FAQPage',
    mainEntity: g.faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
  });
  return {'@context': 'https://schema.org', '@graph': graph};
}

export default function GuideArticle({guide: g}: {guide: Guide}) {
  const related = g.related.map(guideBySlug).filter(Boolean) as Guide[];
  const sameCategory = GUIDES.filter(x => x.category === g.category && x.slug !== g.slug && !g.related.includes(x.slug)).slice(0, 3);
  return (
    <article className="ps">
      <JsonLd data={guideJsonLd(g)}/>
      <div className="ps-wrap">
        <header className="ps-guide-hero">
          <nav className="ps-crumbs" aria-label="경로">
            <Link href="/">{SITE_NAME}</Link><span>›</span><Link href="/guide">사용 가이드</Link><span>›</span>
            <Link href={`/guide#${g.category}`}>{categoryName(g.category)}</Link>
          </nav>
          <span className="ps-tag">{categoryName(g.category)}</span>
          <h1>{g.title}</h1>
          <div className="ps-meta">
            <span>대상 · {g.audience.map(a => audienceName[a]).join(', ')}</span>
            <span>읽는 시간 {g.minutes}분</span>
            <span>업데이트 <time dateTime={g.updated}>{g.updated}</time></span>
          </div>
        </header>
        <div className="ps-article">
          <div className="ps-body">
            <p className="ps-answer"><b>핵심 요약</b>{g.summary}</p>
            <VisualBlock visual={g.hero} priority/>
            {g.sections.map((s, i) => (
              <section key={s.heading} aria-labelledby={anchor(i)}>
                <h2 id={anchor(i)}>{s.heading}</h2>
                {s.body.map(p => <p key={p.slice(0, 40)}>{p}</p>)}
                {s.steps && <ol className="ps-howto">{s.steps.map(t => <li key={t}>{t}</li>)}</ol>}
                {s.tip && <p className="ps-tip"><b>팁</b>{s.tip}</p>}
                {s.visual && <VisualBlock visual={s.visual}/>}
              </section>
            ))}
            {g.faq.length > 0 && (
              <section aria-labelledby="faq">
                <h2 id="faq">자주 묻는 질문</h2>
                <div className="ps-faq">
                  {g.faq.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
                </div>
              </section>
            )}
            {(related.length > 0 || sameCategory.length > 0) && (
              <section aria-labelledby="more">
                <h2 id="more">함께 읽으면 좋은 글</h2>
                <div className="ps-cardgrid">
                  {[...related, ...sameCategory].slice(0, 6).map(r => (
                    <Link key={r.slug} className="ps-card" href={`/guide/${r.slug}`}>
                      <small>{categoryName(r.category)}</small><b>{r.title}</b><p>{r.description}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <div className="ps-kw" aria-label="관련 키워드">{g.keywords.map(k => <span key={k}>#{k}</span>)}</div>
          </div>
          <aside className="ps-toc" aria-label="목차">
            <b>목차</b>
            <ol>
              {g.sections.map((s, i) => <li key={s.heading}><a href={`#${anchor(i)}`}>{s.heading}</a></li>)}
              {g.faq.length > 0 && <li><a href="#faq">자주 묻는 질문</a></li>}
            </ol>
          </aside>
        </div>
      </div>
    </article>
  );
}
