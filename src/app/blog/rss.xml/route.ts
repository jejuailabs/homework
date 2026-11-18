import {SITE_NAME, SITE_URL} from '@/modules/public-site/site';
import {postUrl} from '@/modules/blog/posts';
import {allPosts} from '@/modules/blog/store';
import {BLOG_NAME, categoryOf} from '@/modules/blog/taxonomy';

// RSS 2.0 feed for Naver Search Advisor and readers. Newest 50 posts.
export const revalidate = 600;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rfc822 = (day: string) => new Date(`${day}T09:00:00+09:00`).toUTCString();

export async function GET() {
  const posts = (await allPosts()).slice(0, 50);
  const items = posts.map(p => [
    '<item>',
    `<title>${esc(p.title)}</title>`,
    `<link>${postUrl(p)}</link>`,
    `<guid isPermaLink="true">${postUrl(p)}</guid>`,
    `<description>${esc(p.description)}</description>`,
    `<category>${esc(categoryOf(p.section, p.category)?.name ?? p.section)}</category>`,
    `<pubDate>${rfc822(p.published)}</pubDate>`,
    '</item>',
  ].join(''));
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>',
    `<title>${esc(BLOG_NAME)}</title>`,
    `<link>${SITE_URL}/blog</link>`,
    `<atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>`,
    `<description>${esc(`${SITE_NAME} 사용설명서와 선생님 업무 Tip`)}</description>`,
    '<language>ko</language>',
    posts[0] ? `<lastBuildDate>${rfc822(posts[0].updated)}</lastBuildDate>` : '',
    ...items,
    '</channel></rss>',
  ].join('\n');
  return new Response(xml, {headers: {'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600'}});
}
