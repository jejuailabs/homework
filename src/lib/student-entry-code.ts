export function normalizeStudentCode(value: string): string {
  return value.replace(/\s/g, '').toUpperCase();
}

export function validStudentCode(value: string): boolean {
  // Existing issued codes remain usable until a teacher replaces them.
  return /^\d{6}$/.test(value) || /^[A-Z0-9_-]{12}$/.test(value);
}
