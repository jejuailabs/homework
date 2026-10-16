import {randomInt} from 'node:crypto';

export class StudentCodeCollision extends Error {}

export function generateStudentCodes(count: number, draw: () => number = () => randomInt(100000, 1000000)): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Invalid student code batch');
  const codes = new Set<string>();
  for (let tries = 0; codes.size < count && tries < count * 100; tries++) {
    const value = draw();
    if (!Number.isInteger(value) || value < 100000 || value > 999999) throw new Error('Invalid student code');
    codes.add(String(value));
  }
  if (codes.size !== count) throw new Error('Student code generation exhausted');
  return [...codes];
}

export async function withStudentCodes<T>(count: number, reserve: (codes: string[]) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {return await reserve(generateStudentCodes(count));}
    catch (error) {if (!(error instanceof StudentCodeCollision)) throw error;}
  }
  throw new Error('Student code reservation exhausted');
}
