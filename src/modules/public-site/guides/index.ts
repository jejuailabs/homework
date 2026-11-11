import type {Guide} from '../types';
import {guides as a} from './a-start-homework-safety';
import {guides as b} from './b-exhibition-myspace-rewards';
import {guides as c} from './c-ai-activities-tools';
import {guides as d} from './d-cards-family-insight';

export const GUIDES: Guide[] = [...a, ...b, ...c, ...d];

export function guideBySlug(slug: string) {
  return GUIDES.find(g => g.slug === slug);
}
