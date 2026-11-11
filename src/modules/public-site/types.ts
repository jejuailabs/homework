// Public, search-facing pages: the landing sections under the sign-in screen
// and the user-guide articles at /guide. Content lives in plain data files so
// it can be reviewed and edited without touching layout code.

export type MockId =
  | 'homework-list' | 'homework-review' | 'homework-submit'
  | 'exhibition-wall' | 'exhibition-world'
  | 'berry-chat' | 'berry-preview'
  | 'board' | 'poll' | 'canvas'
  | 'cards' | 'cards-game'
  | 'points-shop' | 'my-space' | 'diary'
  | 'timer' | 'random' | 'chalkboard'
  | 'family-report' | 'student-code' | 'dashboard'
  | 'lesson-review' | 'speech';

export type Visual =
  | {src: string; alt: string; caption?: string; wide?: boolean}
  | {mock: MockId; alt: string; caption?: string};

export type CategoryId =
  | 'start' | 'homework' | 'exhibition' | 'ai' | 'activities'
  | 'cards' | 'rewards' | 'myspace' | 'tools' | 'family' | 'safety' | 'insight';

export type GuideSection = {
  heading: string;
  body: string[];
  steps?: string[];
  tip?: string;
  visual?: Visual;
};

export type Guide = {
  slug: string;
  category: CategoryId;
  title: string;
  /** Under ~60 chars, used for <title>. Falls back to title. */
  seoTitle?: string;
  /** 80–160 chars, used for meta description and cards. */
  description: string;
  keywords: string[];
  /** One- or two-sentence direct answer shown first (quoted by search and AI). */
  summary: string;
  audience: ('teacher' | 'student' | 'parent')[];
  minutes: number;
  updated: string;
  hero: Visual;
  sections: GuideSection[];
  faq: {q: string; a: string}[];
  related: string[];
};
