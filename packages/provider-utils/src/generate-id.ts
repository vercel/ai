import { InvalidArgumentError } from '@ai-sdk/provider';
import { customAlphabet } from 'nanoid/non-secure';

/**
 * Creates an ID generator. The total length of the ID is the sum of the prefix, separator, and random part length.
 *
 * @param alphabet - The alphabet to use for the ID. Default: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.
 * @param prefix - The prefix of the ID to generate. Default: ''.
 * @param separator - The separator between the prefix and the random part of the ID. Default: '-'.
 * @param size - The size of the random part of the ID to generate. Default: 16.
 */
export const createIdGenerator = ({
  prefix,
  size: defaultSize = 16,
  alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  separator = '-',
}: {
  prefix?: string;
  separator?: string;
  size?: number;
  alphabet?: string;
} = {}): ((size?: number) => string) => {
  const generator = customAlphabet(alphabet, defaultSize);

  if (prefix == null) {
    return generator;
  }

  // check that the prefix is not part of the alphabet (otherwise prefix checking can fail randomly)
  if (alphabet.includes(separator)) {
    throw new InvalidArgumentError({
      argument: 'separator',
      message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`,
    });
  }

  return size => `${prefix}${separator}${generator(size)}`;
};

/**
 * Generates a 16-character random string to use for IDs. Not secure.
 *
 * @param size - The size of the ID to generate. Default: 16.
 */
export const generateId = createIdGenerator();
