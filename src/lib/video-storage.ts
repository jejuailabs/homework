export const videoStorages = ['google', 'r2'] as const;
export type VideoStorage = typeof videoStorages[number];

/** The path prefix records the store, so every file reader keeps working from the saved path alone. */
export const R2_VIDEO_PREFIX = 'r2-videos/';
export const r2VideoPath = (uid: string, jobId: string) => `${R2_VIDEO_PREFIX}${uid}/${jobId}/video.mp4`;
export const isR2Path = (path: unknown): path is string => typeof path === 'string' && path.startsWith(R2_VIDEO_PREFIX);

/** Only an administrator can open a video homework as a storage test. */
export const canMarkVideoStorageTest = (role: unknown, submissionType: unknown) => submissionType === 'video' && (role === 'admin' || role === 'superadmin');

/** The platform-wide store for new compressed videos: R2 only when the switch says so, R2 is configured and the kill switch is off. */
export const defaultVideoStorage = (mode: unknown, r2Ready: boolean, disabled?: unknown): VideoStorage => mode === 'r2' && r2Ready && disabled !== 'true' ? 'r2' : 'google';

/** A student's choice counts only on a test homework; every other video goes to the platform default (Google unless switched). */
export const chosenVideoStorage = (assignment: {videoStorageTest?: unknown}, choice: unknown, fallback: VideoStorage = 'google'): VideoStorage => assignment.videoStorageTest === true && (choice === 'r2' || choice === 'google') ? choice : fallback;
