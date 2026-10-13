/** The answer format a teacher selects when creating an assignment. */
export const submissionTypes = ['text', 'image', 'video'] as const;
export type SubmissionType = (typeof submissionTypes)[number];
export type AssignmentSubmissionType = SubmissionType | 'legacy';

// Existing assignments did not prescribe an answer format. Keep those tasks
// usable without rewriting historical assignments or their submissions.
export function assignmentSubmissionType(value: unknown): AssignmentSubmissionType {
  return submissionTypes.includes(value as SubmissionType) ? value as SubmissionType : 'legacy';
}

export const imageSubmissionMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const videoSubmissionMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export function acceptsSubmissionFile(type: AssignmentSubmissionType, mime: unknown): boolean {
  if (typeof mime !== 'string' || type === 'text') return false;
  const image = imageSubmissionMimeTypes.includes(mime as (typeof imageSubmissionMimeTypes)[number]);
  const video = videoSubmissionMimeTypes.includes(mime as (typeof videoSubmissionMimeTypes)[number]);
  if (type === 'image') return image;
  if (type === 'video') return video;
  return image || video || mime === 'application/pdf';
}
