export const characterFiles = {
  cat: 'cat-mochi',
  dog: 'dog-dubu',
  hamster: 'hamster-kong',
  alpaca: 'alpaca-cloud',
  rabbit: 'rabbit-tori',
  otter: 'otter-moa',
} as const;

export type Character = keyof typeof characterFiles;
export const characters = Object.keys(characterFiles) as Character[];
export const characterCatalog = characters.map(id => ({id, file: characterFiles[id]}));
