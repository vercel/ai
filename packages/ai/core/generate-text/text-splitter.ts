export interface TextSplit {
  start: number;
  end: number;
  text: string;
}

export function splitText<T>(
  text: string,
  splitter: RegExp | string,
): TextSplit[] {
  const splits: TextSplit[] = [];
  let lastIndex = 0;

  function getNextMatch() {
    if (lastIndex === text.length) {
      return null;
    }

    if (typeof splitter === 'string') {
      if (splitter === '') {
        return { index: lastIndex, 0: text.slice(lastIndex, lastIndex + 1) };
      }

      const index = text.indexOf(splitter, lastIndex);
      return index === -1 ? null : { index, 0: splitter };
    }

    const regex = splitter.flags.includes('g')
      ? splitter
      : new RegExp(splitter.source, `${splitter.flags}g`);
    regex.lastIndex = lastIndex;
    const match = regex.exec(text);

    // If it's a zero-width match, we need to find the next match position
    if (match && match[0] === '') {
      regex.lastIndex = match.index + 1;
      const nextMatch = regex.exec(text);
      return { ...match, endIndex: nextMatch ? nextMatch.index : text.length };
    }

    return match;
  }

  let match: ReturnType<typeof getNextMatch>;

  while ((match = getNextMatch())) {
    const matchEndIndex =
      'endIndex' in match ? match.endIndex : match.index + match[0].length;

    const end = matchEndIndex;

    if (end > lastIndex) {
      const segment = text.slice(lastIndex, end);

      if (!segment.trim()) {
        if (splits.length > 0) {
          const previousSplit = splits[splits.length - 1];
          if (previousSplit) {
            previousSplit.end = end;
            previousSplit.text = text.slice(previousSplit.start, end);
          }
        }
      } else {
        splits.push({
          start: lastIndex,
          end,
          text: segment,
        });
      }
    }

    lastIndex = matchEndIndex;
  }

  if (lastIndex < text.length) {
    splits.push({
      start: lastIndex,
      end: text.length,
      text: text.slice(lastIndex),
    });
  }

  return splits;
}
