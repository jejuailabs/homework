import type {PersonalExhibition} from './types';

/** The room belongs to the student record, never to a replaceable login code. */
export function personalExhibition(createdAt: string): PersonalExhibition {
  return {createdAt};
}
