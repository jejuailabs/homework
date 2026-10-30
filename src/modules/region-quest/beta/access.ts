/** One access policy for the menu, launcher, and authenticated preview endpoint. */
export function canPreviewRegionQuest(role: unknown): boolean {
  return role === 'admin' || role === 'superadmin';
}
