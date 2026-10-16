import { praiseStickers } from '../artwork-extensions/types';
export function guestText(value: unknown) { if (typeof value !== 'string')
    throw Error('COMMENT_INVALID'); const text = value.trim().normalize('NFC'); if (!text || text.length > 120 || /[\r\n\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(text) || /(?:https?:|www\.|\.(?:com|net|kr)\b|[\w.+-]+@[\w.-]+\.|(?:\+?82|0\d{1,2})[- .]?\d{3,4}[- .]?\d{4})/i.test(text))
    throw Error('COMMENT_INVALID'); return text; }
export function guestSticker(value: unknown) { if (!praiseStickers.some(s => s.id === value))
    throw Error('STICKER_INVALID'); return String(value); }
export function guestName(value: unknown) { if (value === undefined || value === '')
    return '전시를 찾아온 손님'; const s = guestText(value); if (s.length > 20)
    throw Error('NAME_INVALID'); return s; }
