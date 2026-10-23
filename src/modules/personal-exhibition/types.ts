import type {ExhibitionArtwork} from '@/lib/exhibition-types';

export type PersonalExhibition = {createdAt: string};
export type PersonalArtwork = ExhibitionArtwork & {exhibitionTitle: string};
export type PersonalExhibitionPage = {
  exhibition: PersonalExhibition;
  student: {id: string; name: string; number: number; className: string};
  artworks: PersonalArtwork[];
  hasMore: boolean;
  nextCursor: string | null;
};
