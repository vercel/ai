const lastWhitespaceRegexp = /^([\s\S]*?)(\s+)(\S*)$/;

/**
 * Splits the text on the last whitespace.
 *
 * Whitespace is defined as one or more whitespace characters,
 * e.g. space, tab, newline, etc.
 *
 * @param text - The text to split.
 * @returns The prefix, whitespace, and suffix. Undefined if there is no whitespace.
 */
export function splitOnLastWhitespace(text: string):
  | {
      prefix: string;
      whitespace: string;
      suffix: string;
    }
  | undefined {
  const match = text.match(lastWhitespaceRegexp);
  return match
    ? { prefix: match[1], whitespace: match[2], suffix: match[3] }
    : undefined;
}
