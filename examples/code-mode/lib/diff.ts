import type { DiffPart } from './types';

export function diffWords(left: string, right: string): DiffPart[] {
  const leftWords = tokenize(left);
  const rightWords = tokenize(right);
  const lengths = Array.from({ length: leftWords.length + 1 }, () =>
    new Array<number>(rightWords.length + 1).fill(0),
  );

  for (let leftIndex = leftWords.length - 1; leftIndex >= 0; leftIndex--) {
    for (
      let rightIndex = rightWords.length - 1;
      rightIndex >= 0;
      rightIndex--
    ) {
      lengths[leftIndex][rightIndex] =
        leftWords[leftIndex] === rightWords[rightIndex]
          ? lengths[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(
              lengths[leftIndex + 1][rightIndex],
              lengths[leftIndex][rightIndex + 1],
            );
    }
  }

  const parts: DiffPart[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < leftWords.length && rightIndex < rightWords.length) {
    if (leftWords[leftIndex] === rightWords[rightIndex]) {
      pushPart(parts, 'equal', leftWords[leftIndex]);
      leftIndex++;
      rightIndex++;
    } else if (
      lengths[leftIndex + 1][rightIndex] >= lengths[leftIndex][rightIndex + 1]
    ) {
      pushPart(parts, 'removed', leftWords[leftIndex]);
      leftIndex++;
    } else {
      pushPart(parts, 'added', rightWords[rightIndex]);
      rightIndex++;
    }
  }

  while (leftIndex < leftWords.length) {
    pushPart(parts, 'removed', leftWords[leftIndex]);
    leftIndex++;
  }

  while (rightIndex < rightWords.length) {
    pushPart(parts, 'added', rightWords[rightIndex]);
    rightIndex++;
  }

  return parts;
}

function tokenize(value: string): string[] {
  return value.match(/\S+\s*/g) ?? [];
}

function pushPart(
  parts: DiffPart[],
  type: DiffPart['type'],
  value: string,
): void {
  const last = parts.at(-1);
  if (last?.type === type) {
    last.value += value;
    return;
  }
  parts.push({ type, value });
}
