/**
 * Friendly default names like "SwiftOtter42", so nobody starts as "Player". Default words
 * are at most 7 letters so every default fits NAME_MAX_LENGTH (src/shared/names.ts).
 */
import { pickOne } from './random';

const ADJECTIVES = [
  'Swift', 'Brave', 'Sneaky', 'Lucky', 'Mighty', 'Fuzzy', 'Zippy', 'Jolly', 'Clever', 'Bouncy',
  'Cosmic', 'Turbo', 'Sly', 'Plucky', 'Snappy', 'Witty', 'Dashing', 'Bold', 'Chill', 'Spicy',
];

const ANIMALS = [
  'Otter', 'Panda', 'Fox', 'Koala', 'Falcon', 'Badger', 'Gecko', 'Llama', 'Narwhal', 'Penguin',
  'Moose', 'Lynx', 'Puffin', 'Raccoon', 'Walrus', 'Beaver', 'Tiger', 'Yak', 'Bison', 'Squid',
];

export function randomName(random: () => number): string {
  const number = 10 + Math.floor(random() * 90);
  return `${pickOne(ADJECTIVES, random)}${pickOne(ANIMALS, random)}${number}`;
}
