/**
 * Berry's [이름](/teacher/…) links become banners under the answer; only ourclass teacher pages, never outside links.
 * The model sometimes pads the address with spaces or writes it bare, so every /teacher address is lifted out of
 * the sentence: a teacher should never read a raw address.
 */
const PATH = String.raw`\/teacher(?:[/?][^\s)\]]{0,400})?`;
const BANNER_LINK = new RegExp(String.raw`\[([^\]\n]{1,120})\]\(\s*(${PATH})\s*\)`, 'g');
const BARE_LINK = new RegExp(String.raw`[(\[<]?\s*(?<![\w/.])(${PATH})\s*[)\]>]?`, 'g');
export type BannerLink = {label: string; href: string};
export function withBanners(text: string): {text: string; links: BannerLink[]} {
  const links: BannerLink[] = [];
  const named = text.replace(BANNER_LINK, (_, label: string, href: string) => {links.push({label: label.trim(), href}); return label.trim();});
  const clean = named.replace(BARE_LINK, (_, href: string) => {links.push({label: '', href: href.replace(/[.,]+$/, '')}); return '';});
  const unique = new Map<string, BannerLink>();
  for (const link of links) if (!unique.get(link.href)?.label) unique.set(link.href, link);
  return {text: clean.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim(), links: [...unique.values()].slice(0, 12)};
}
