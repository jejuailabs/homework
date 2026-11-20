/** Joins dictated text onto what is already typed, with one space between. */
export function joinDictation(before: string, spoken: string) {
  const said = spoken.trim();
  if (!said) return before;
  return before && !/\s$/.test(before) ? `${before} ${said}` : `${before}${said}`;
}
