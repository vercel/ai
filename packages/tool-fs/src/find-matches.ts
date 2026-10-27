export type MatchMode = 'exact' | 'trailing-whitespace' | 'unicode-punctuation';

export type MatchRange = { start: number; end: number };

// Typographic characters that models often replace with their ASCII
// equivalents, or the other way around. Every replacement is one character, so
// offsets stay aligned.
const PUNCTUATION: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
  '″': '"',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '–': '-',
  '—': '-',
  '―': '-',
  '−': '-',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
};

type NormalizedText = {
  text: string;
  // Index in the original text of each character in `text`.
  offsets: number[];
  // Whether whitespace at the very end of the text was removed.
  removedTrailingWhitespace: boolean;
};

function isHorizontalWhitespace(char: string, mode: MatchMode): boolean {
  return (
    char === ' ' ||
    char === '\t' ||
    (mode === 'unicode-punctuation' && PUNCTUATION[char] === ' ')
  );
}

function isLineEnd(text: string, index: number): boolean {
  return (
    index === text.length ||
    text[index] === '\n' ||
    (text[index] === '\r' && text[index + 1] === '\n')
  );
}

/**
 * Remove whitespace at the end of each line and, for `unicode-punctuation`,
 * replace typographic punctuation with ASCII. Keeps a map back to the
 * original offsets so that a match can be replaced in the original text.
 */
function normalize(text: string, mode: MatchMode): NormalizedText {
  const chars: string[] = [];
  const offsets: number[] = [];
  let removedTrailingWhitespace = false;

  let index = 0;
  while (index < text.length) {
    if (isHorizontalWhitespace(text[index], mode)) {
      let end = index;
      while (end < text.length && isHorizontalWhitespace(text[end], mode)) {
        end++;
      }
      if (isLineEnd(text, end)) {
        removedTrailingWhitespace ||= end === text.length;
        index = end;
        continue;
      }
    }

    const char = text[index];
    chars.push(
      mode === 'unicode-punctuation' ? (PUNCTUATION[char] ?? char) : char,
    );
    offsets.push(index);
    index++;
  }

  return { text: chars.join(''), offsets, removedTrailingWhitespace };
}

function findAll(content: string, search: string): number[] {
  const indices: number[] = [];
  let index = content.indexOf(search);
  while (index !== -1) {
    indices.push(index);
    index = content.indexOf(search, index + search.length);
  }
  return indices;
}

/**
 * Find all non-overlapping occurrences of `search` in `content`. Tries an
 * exact match first, then ignores whitespace at line ends, then also treats
 * typographic punctuation as ASCII. Returns the ranges in the original
 * `content` for the first mode that matches.
 */
export function findMatches({
  content,
  search,
}: {
  content: string;
  search: string;
}): { mode: MatchMode; ranges: MatchRange[] } | undefined {
  const exact = findAll(content, search);
  if (exact.length > 0) {
    return {
      mode: 'exact',
      ranges: exact.map(start => ({ start, end: start + search.length })),
    };
  }

  for (const mode of ['trailing-whitespace', 'unicode-punctuation'] as const) {
    const normalizedContent = normalize(content, mode);
    const normalizedSearch = normalize(search, mode);
    if (normalizedSearch.text === '') {
      return undefined;
    }

    const starts = findAll(
      normalizedContent.text,
      normalizedSearch.text,
    ).filter(start => {
      // When trailing whitespace was removed from the end of the search
      // text, it must also end at a line end in the content. Otherwise
      // `foo ` would match the start of `foobar`.
      if (!normalizedSearch.removedTrailingWhitespace) return true;
      const next = start + normalizedSearch.text.length;
      return isLineEnd(normalizedContent.text, next);
    });

    if (starts.length > 0) {
      return {
        mode,
        ranges: starts.map(start => ({
          start: normalizedContent.offsets[start],
          end:
            normalizedContent.offsets[
              start + normalizedSearch.text.length - 1
            ] + 1,
        })),
      };
    }
  }

  return undefined;
}

export function replaceRanges({
  content,
  ranges,
  replacement,
}: {
  content: string;
  ranges: MatchRange[];
  replacement: string;
}): string {
  let result = '';
  let position = 0;
  for (const range of ranges) {
    result += content.slice(position, range.start) + replacement;
    position = range.end;
  }
  return result + content.slice(position);
}

export function getLineNumber(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}
