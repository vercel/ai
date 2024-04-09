import { customAlphabet } from 'nanoid/non-secure';

/**
 * Generates a 7-character random string to use for IDs. Not secure.
 */
export const generateId = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7,
);
