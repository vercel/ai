import { splitOnLastWhitespace } from './split-on-last-whitespace';

export function removeTextAfterLastWhitespace(text: string): string {
  const match = splitOnLastWhitespace(text);
  return match ? match.prefix + match.whitespace : text;
}
