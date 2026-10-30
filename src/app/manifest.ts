import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: '모두의 교실 · Our Classroom', short_name: '모두의 교실', lang: 'ko',
    description: '동물 친구와 함께하는 우리 반 숙제와 수업 활동',
    start_url: '/', scope: '/', display: 'standalone',
    background_color: '#fffaec', theme_color: '#2d7375', prefer_related_applications: false,
    icons: [
      {src: '/icons/app-192.png?v=classroom-4', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/icons/app-512.png?v=classroom-4', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/icons/app-maskable-512.png?v=classroom-4', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
  };
}
