/** Shared API contract: each class is a building, and exhibitions are rooms inside it. */
import type {ArtworkModuleOptions} from '@/modules/artwork-extensions/types';
export type ExhibitionStatus = 'draft' | 'open' | 'closed';
export type ExhibitionTheme = 'cozy' | 'forest' | 'sky' | 'ocean';
export type ArtworkStatus = 'pending' | 'approved' | 'revision';
export type CommentStatus = 'pending' | 'approved' | 'hidden';
export type ArtReaction = 'colors' | 'idea' | 'story';
export type ArtReactionCounts = Record<ArtReaction, number>;

export type Exhibition = {
  id: string; title: string; description: string; classId: string; className: string;
  grade: string; year: number; theme: ExhibitionTheme;
  ownerUid: string; status: ExhibitionStatus; commentsEnabled: boolean;
  allowStudentUploads?: boolean; publicSharingEnabled?: boolean;
  artworkModules?: ArtworkModuleOptions;
  artworkCount: number; approvedCount: number; createdAt: string; updatedAt: string;
};
export type ExhibitionStudent = {
  id: string; name: string; number: number; character: string; xp: number;
};
export type ExhibitionClass = { id: string; name: string; grade: string; studentCount: number; year?: number };
export type ExhibitionProfile = ExhibitionStudent & { classId: string; className: string };
export type ExhibitionArtwork = {
  id: string; exhibitionId: string; studentId: string; studentName: string; studentNumber: number;
  title: string; description: string; status: ArtworkStatus; feedback: string;
  artistName?: string; artworkDate?: string;
  width: number; height: number; url: string; thumbnailUrl: string;
  createdAt: string; reviewedAt: string | null; ownReaction?: ArtReaction;
  /** Only the author and owning teacher receive this private encouragement summary. */
  reactionCounts?: ArtReactionCounts;
};
export type ExhibitionComment = {
  id: string; text: string; authorName: string; authorRole: 'teacher' | 'student';
  isOwn: boolean; status: CommentStatus; createdAt: string;
};
export type ExhibitionPassport = {
  /** Once per exhibition, regardless of number of works or re-approvals. */
  artist: boolean; thoughtfulComment: boolean; stamps: number;
};
export type ExhibitionStorageUsage = { usedBytes: number; reservedBytes: number; limitBytes: number };
export type ExhibitionListResponse = {
  exhibitions: Exhibition[]; classes?: ExhibitionClass[]; profile?: ExhibitionProfile;
  /** Bootstrap responses include the class used for the returned first page. */
  selectedClassId?: string | null;
  /** Role of the session verified by the list API, independent of the URL. */
  viewerRole: 'teacher' | 'student';
  viewerId: string;
  /** Listing is intentionally bounded; old exhibitions are kept in storage. */
  limit: number; hasMore: boolean; nextCursor: string | null; storageUsage?: ExhibitionStorageUsage;
};
export type ExhibitionDetailResponse = {
  exhibition: Exhibition; artworks: ExhibitionArtwork[]; students?: ExhibitionStudent[];
  passport?: ExhibitionPassport; artworkLimit: number;
};
