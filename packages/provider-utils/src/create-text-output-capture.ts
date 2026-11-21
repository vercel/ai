import { InvalidArgumentError } from '@ai-sdk/provider';

/**
 * Keeps a prefix of a text stream while counting all UTF-16 code units, like
 * `String.length`. Appending more output does not retain the discarded text.
 */
export function createTextOutputCapture({ maxLength }: { maxLength: number }) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) {
    throw new InvalidArgumentError({
      argument: 'maxOutputLength',
      message: 'Must be a positive safe integer.',
    });
  }

  let text = '';
  let length = 0;

  return {
    append(chunk: string): void {
      length += chunk.length;
      const remaining = maxLength - text.length;
      if (remaining > 0) {
        // A substring can keep its entire source string alive. Joining its
        // code units copies the prefix, including unpaired surrogates.
        text += chunk.slice(0, remaining).split('').join('');
      }
    },
    get text(): string {
      return text;
    },
    get length(): number {
      return length;
    },
  };
}
