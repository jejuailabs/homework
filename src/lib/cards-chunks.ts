// 끊어읽기: a sentence card can carry chunk boundaries the teacher marked. `chunks` holds word positions: 3 means a break after the
// third word. Words are split on spaces, the same way the sentence puzzle and recall word order cut a sentence. Pure, for the editor,
// the server and the student practice alike.
export const CARD_CHUNK_LIMIT = 30;
export const cardWords = (text: string) => text.normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
/** Keeps only positions that fall between two words of this text: whole numbers, in order, no repeats, at most CARD_CHUNK_LIMIT. */
export function fitChunks(chunks: unknown, text: string): number[] {
  if (!Array.isArray(chunks)) return [];
  const words = cardWords(text).length;
  return [...new Set(chunks.filter((value): value is number => Number.isInteger(value) && value >= 1 && value < words))].sort((a, b) => a - b).slice(0, CARD_CHUNK_LIMIT);
}
/** The sentence cut into its chunks. Without marks the whole sentence is one chunk. */
export function chunkPieces(text: string, chunks: number[] | undefined): string[] {
  const words = cardWords(text), cuts = fitChunks(chunks ?? [], text), pieces: string[] = [];
  let start = 0;
  for (const cut of [...cuts, words.length]) {pieces.push(words.slice(start, cut).join(' ')); start = cut;}
  return pieces.filter(Boolean);
}
export const toggleChunk = (chunks: number[], position: number, text: string) => fitChunks(chunks.includes(position) ? chunks.filter(value => value !== position) : [...chunks, position], text);
/** A starting point the teacher can edit: a break after each word ending in a comma, semicolon or colon, and before common linking words. */
export function suggestChunks(text: string): number[] {
  const words = cardWords(text), linkers = new Set(['and', 'but', 'or', 'so', 'because', 'when', 'that', 'which', 'who', 'if', 'while', 'after', 'before', 'to']);
  const cuts = words.flatMap((word, index) => {
    if (index === words.length - 1) return [];
    if (/[,;:]$/u.test(word)) return [index + 1];
    return index > 0 && linkers.has(words[index + 1].toLocaleLowerCase('en-US')) ? [index + 1] : [];
  });
  return fitChunks(cuts, text);
}
/** Cards a student can practise in chunk mode: sentences the teacher actually cut into two pieces or more. */
export const chunkCards = <T extends {front: string; chunks?: number[]}>(cards: T[]) => cards.filter(card => chunkPieces(card.front, card.chunks).length >= 2);
/** True when the student's order of pieces rebuilds the sentence (pieces that read the same are interchangeable). */
export const chunkOrderCorrect = (pieces: string[], answer: string[]) => answer.length === pieces.length && answer.every((piece, index) => piece === pieces[index]);
