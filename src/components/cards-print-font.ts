// The Korean PDF font, shared by the set and report print dialogs. It is only fetched when a teacher presses 만들기, and a failed fetch is forgotten so the next press retries.
const FONT_URL = '/cards/v1/fonts/NanumGothic-Regular.ttf';
let font: Promise<Uint8Array> | null = null;
export const printFont = () => font ||= fetch(FONT_URL, {signal: AbortSignal.timeout(30000)}).then(async response => {if (!response.ok) throw new Error('font'); return new Uint8Array(await response.arrayBuffer());}).catch(cause => {font = null; throw cause;});
