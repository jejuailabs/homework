export type AssignmentMaterial = {id: string; fileName: string; contentType: string; size: number; url?: string};
export const ASSIGNMENT_MATERIAL_LIMIT = 10;
export const ASSIGNMENT_MATERIAL_IMAGE_BYTES = 25 * 1024 * 1024;
export const ASSIGNMENT_MATERIAL_VIDEO_BYTES = 250 * 1024 * 1024;
export const assignmentMaterialTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'] as const;
export function assignmentMaterialMime(file: {type: string; name: string}) {
  return file.type || ({jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime'} as Record<string, string>)[file.name.split('.').at(-1)?.toLowerCase() || ''] || '';
}
export function validAssignmentMaterial(contentType: unknown, size: unknown): boolean {
  return typeof contentType === 'string' && assignmentMaterialTypes.includes(contentType as typeof assignmentMaterialTypes[number]) && typeof size === 'number' && Number.isSafeInteger(size) && size > 0 && size <= (contentType.startsWith('image/') ? ASSIGNMENT_MATERIAL_IMAGE_BYTES : ASSIGNMENT_MATERIAL_VIDEO_BYTES);
}
