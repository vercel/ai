import { spaceSeparator } from './unicode';

export function isSpaceSeparator(c) {
  return typeof c === 'string' && spaceSeparator.test(c);
}

export function isDigit(c) {
  return typeof c === 'string' && /\d/.test(c);
}

export function isHexDigit(c) {
  return typeof c === 'string' && /[\dA-Fa-f]/.test(c);
}
