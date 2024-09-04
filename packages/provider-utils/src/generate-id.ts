import { customAlphabet } from 'nanoid/non-secure';

/**
 * Creates an ID generator that uses an alphabet of digits, uppercase and lowercase letters.
 *
 * @param alphabet - The alphabet to use for the ID. Default: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.
 * @param prefix - The prefix of the ID to generate. Default: ''.
 * @param length - The length of the random part of the ID to generate. Default: 7.
 */
// TODO change length to 16 in 4.0
export const createIdGenerator = ({
  prefix = '',
  length = 7,
  alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
}: {
  prefix?: string;
  length?: number;
  alphabet?: string;
} = {}): (() => string) => {
  const generator = customAlphabet(alphabet, length);
  return () => `${prefix}${generator()}`;
};

/**
 * Generates a 7-character random string to use for IDs. Not secure.
 */
//TODO change length to 16 in 4.0
export const generateId = createIdGenerator();
