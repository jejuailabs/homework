import type {MetadataRoute} from 'next';
import {SITE_URL} from '@/modules/public-site/site';

// Only the home page and the user guide are public. Classroom screens and
// share links (gallery/board/family tokens) stay out of search.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/guide', '/llms.txt'],
      disallow: ['/api/', '/teacher', '/student', '/admin', '/gallery/', '/board/', '/family/', '/berry', '/oauth'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
