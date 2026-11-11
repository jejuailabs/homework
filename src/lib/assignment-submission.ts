/** The answer format a teacher selects when creating an assignment. */
export const submissionTypes = ['text', 'image', 'video', 'audio'] as const;
export type SubmissionType = (typeof submissionTypes)[number];
export type AssignmentSubmissionType = SubmissionType | 'legacy';

// Existing assignments did not prescribe an answer format. Keep those tasks
// usable without rewriting historical assignments or their submissions.
export function assignmentSubmissionType(value: unknown): AssignmentSubmissionType {
  return submissionTypes.includes(value as SubmissionType) ? value as SubmissionType : 'legacy';
}

export const imageSubmissionMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const videoSubmissionMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
/** Recordings made in the browser (webm on Chrome, mp4 on Safari) and common audio files. */
export const audioSubmissionMimeTypes = ['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'] as const;
export const isAudioSubmission = (mime: unknown) => audioSubmissionMimeTypes.includes(mime as (typeof audioSubmissionMimeTypes)[number]);

export function acceptsSubmissionFile(type: AssignmentSubmissionType, mime: unknown): boolean {
  if (typeof mime !== 'string' || type === 'text') return false;
  const image = imageSubmissionMimeTypes.includes(mime as (typeof imageSubmissionMimeTypes)[number]);
  const video = videoSubmissionMimeTypes.includes(mime as (typeof videoSubmissionMimeTypes)[number]);
  const audio = isAudioSubmission(mime);
  if (type === 'image') return image;
  if (type === 'video') return video;
  if (type === 'audio') return audio;
  return image || video || audio || mime === 'application/pdf';
}
