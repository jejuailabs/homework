/** An exhibition's opening moment in Korean school time, whichever device shows it. */
export function exhibitionDateLabel(value: string | null | undefined, locale = 'ko', withTime = false) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '';
  const english = locale === 'en';
  return new Intl.DateTimeFormat(english ? 'en-US' : 'ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: english ? 'short' : 'long', day: 'numeric', ...(withTime ? {hour: 'numeric', minute: '2-digit'} : {})}).format(date);
}
