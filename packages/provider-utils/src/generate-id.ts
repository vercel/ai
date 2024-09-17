import { customAlphabet } from 'nanoid/non-secure';

/**
 * Creates an ID generator that uses an alphabet of digits, uppercase and lowercase letters.
 *
 * @param alphabet - The alphabet to use for the ID. Default: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.
 * @param prefix - The prefix of the ID to generate. Default: ''.
 * @param size - The size of the random part of the ID to generate. Default: 7.
 */
//TODO change default size to 16 in 4.0
export const createIdGenerator = ({
  prefix = '',
  size: defaultSize = 7,
  alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
}: {
  prefix?: string;
  size?: number;
  alphabet?: string;
} = {}): ((size?: number) => string) => {
  const generator = customAlphabet(alphabet, defaultSize);
  return size => `${prefix}${generator(size)}`;
};

/**
 * Generates a 7-character random string to use for IDs. Not secure.
 *
 * @param size - The size of the ID to generate. Default: 7.
 */
//TODO change default size to 16 in 4.0
export const generateId = createIdGenerator();
