import 'server-only';
import {TRY_DEMO_CLASS_DEFAULT, TRY_DEMO_UID_DEFAULT} from './config';

export const tryDemoUid = () => process.env.TRY_DEMO_TEACHER_UID?.trim() || TRY_DEMO_UID_DEFAULT;
export const tryDemoClassId = () => process.env.TRY_DEMO_CLASS_ID?.trim() || TRY_DEMO_CLASS_DEFAULT;
/** TRY_LIVE_DISABLED=true turns off every AI call of the tour at once; the tour pages still open. */
export const tryLiveEnabled = () => process.env.TRY_LIVE_DISABLED !== 'true' && process.env.TRY_DEMO_DISABLED !== 'true';
