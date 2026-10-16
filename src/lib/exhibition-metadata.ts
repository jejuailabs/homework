export function artworkToday(date = new Date()): string {return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);}
export function validArtworkDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
