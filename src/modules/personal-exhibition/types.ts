import type {ExhibitionArtwork} from '@/lib/exhibition-types';

export type PersonalExhibition = {createdAt: string};
/** Exhibition record as it stood when the work was shown, so later class renames do not rewrite history. */
export type PersonalArtwork = ExhibitionArtwork & {
  exhibitionTitle: string; exhibitionDescription: string;
  exhibitionGrade: string; exhibitionClassName: string; exhibitionYear: number | null;
  /** Korean date the work joined the exhibition: teacher approval, or upload for works still waiting. */
  exhibitedOn: string;
};
export type PersonalExhibitionPage = {
  exhibition: PersonalExhibition;
  student: {id: string; name: string; number: number; className: string};
  artworks: PersonalArtwork[];
  hasMore: boolean;
  nextCursor: string | null;
};
