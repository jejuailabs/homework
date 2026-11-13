/** Shared API contract: each class is a building, and exhibitions are rooms inside it. */
import type {ArtworkModuleOptions} from '@/modules/artwork-extensions/types';
import type {WorldCompanion} from './whiteknee-world-model';
export type ExhibitionStatus = 'draft' | 'open' | 'closed';
/** cozy/forest/sky/ocean are the classic room; earth/moon/saturn open the space-mode 3D museum. */
export type ExhibitionTheme = 'cozy' | 'forest' | 'sky' | 'ocean' | 'earth' | 'moon' | 'saturn';
export type ClassicExhibitionTheme = 'cozy' | 'forest' | 'sky' | 'ocean';
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
  /** Set when a homework room created this exhibition and feeds it students' photos and videos. */
  linkedAssignmentId?: string;
  /** Topic hashtags (no '#'): made automatically from the title, editable by the teacher. */
  tags?: string[]; tagsEdited?: boolean;
  artworkCount: number; approvedCount: number; createdAt: string; updatedAt: string;
};
export type ExhibitionStudent = {
  id: string; name: string; number: number; character: string; xp: number;
};
export type ExhibitionClass = { id: string; name: string; grade: string; studentCount: number; year?: number };
export type ExhibitionProfile = ExhibitionStudent & { classId: string; className: string; companion?: WorldCompanion | null };
export type ExhibitionArtwork = {
  id: string; exhibitionId: string; studentId: string; studentName: string; studentNumber: number;
  title: string; description: string; status: ArtworkStatus; feedback: string;
  artistName?: string; artworkDate?: string;
  width: number; height: number; url: string; thumbnailUrl: string;
  /** Homework videos synced into the room play from here; url and thumbnailUrl are the poster. */
  videoUrl?: string;
  /** A sound file uploaded with the photo (separate from the docent recording). */
  audioUrl?: string; audioFileName?: string;
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
  /** Teacher: their 전시관 (theme halls) with room counts. */
  halls?: {kind: 'classic' | 'space'; count: number}[];
  /** Student: rooms they have opened, and rooms holding their own artwork. */
  visited?: string[]; mine?: string[];
};
export type ExhibitionDetailResponse = {
  exhibition: Exhibition; artworks: ExhibitionArtwork[]; students?: ExhibitionStudent[];
  passport?: ExhibitionPassport; artworkLimit: number;
};
