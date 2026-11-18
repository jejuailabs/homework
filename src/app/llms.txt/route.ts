import {SITE_ALT_NAMES, SITE_NAME, SITE_ONE_LINER, SITE_URL} from '@/modules/public-site/site';
import {postUrl} from '@/modules/blog/posts';
import {allPosts} from '@/modules/blog/store';
import {SECTIONS} from '@/modules/blog/taxonomy';

// llms.txt: a plain-text map of the site for AI assistants and answer engines.
export const revalidate = 600;

export async function GET() {
  const posts = await allPosts();
  const lines = [
    `# ${SITE_NAME} (${SITE_ALT_NAMES.join(', ')})`,
    '',
    `> ${SITE_ONE_LINER}`,
    '',
    `- 주소: ${SITE_URL} (교실.com으로 들어와도 같은 곳으로 연결됩니다)`,
    '- 대상: 초등 학급의 선생님, 학생, 보호자',
    '- 선생님은 Google 계정으로, 학생은 선생님이 준 숫자 6자리 입장 코드로 로그인합니다. 보호자는 계정 없이 선생님이 켠 QR·링크로만 봅니다.',
    `- 블로그(사용설명서·선생님 업무 Tip): ${SITE_URL}/blog`,
    '',
  ];
  for (const s of SECTIONS) {
    for (const c of s.categories) {
      const items = posts.filter(p => p.section === s.id && p.category === c.id);
      if (!items.length) continue;
      lines.push(`## ${s.name} · ${c.name}`, '');
      for (const p of items) lines.push(`- [${p.title}](${postUrl(p)}): ${p.summary}`);
      lines.push('');
    }
  }
  return new Response(lines.join('\n'), {headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600'}});
}
