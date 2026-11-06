export const videoStorages = ['google', 'r2'] as const;
export type VideoStorage = typeof videoStorages[number];

/** The path prefix records the store, so every file reader keeps working from the saved path alone. */
export const R2_VIDEO_PREFIX = 'r2-videos/';
export const r2VideoPath = (uid: string, jobId: string) => `${R2_VIDEO_PREFIX}${uid}/${jobId}/video.mp4`;
export const isR2Path = (path: unknown): path is string => typeof path === 'string' && path.startsWith(R2_VIDEO_PREFIX);

/** Only an administrator can open a video homework as a storage test. */
export const canMarkVideoStorageTest = (role: unknown, submissionType: unknown) => submissionType === 'video' && (role === 'admin' || role === 'superadmin');

/** A student's choice counts only on a test homework; every other video stays on Google. */
export const chosenVideoStorage = (assignment: {videoStorageTest?: unknown}, choice: unknown): VideoStorage => assignment.videoStorageTest === true && choice === 'r2' ? 'r2' : 'google';
