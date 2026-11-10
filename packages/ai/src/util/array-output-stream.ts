import {
  safeParseJSON,
  safeValidateTypes,
  type Schema,
} from '@ai-sdk/provider-utils';

export type ArrayOutputStreamParser<ELEMENT> = (
  textDelta: string,
) => Promise<
  { partial: ELEMENT[]; textDelta: string } | undefined | 'fallback'
>;

enum Phase {
  Prefix,
  Elements,
  Suffix,
  Done,
}

/**
 * Scan only new text and parse/validate each delimited element once. Keep the
 * last element pending until another starts or the enclosing object closes,
 * matching the partial JSON parser's treatment of an incomplete response.
 * Nonstandard envelopes and malformed JSON use the existing partial parser.
 */
export function createArrayOutputStreamParser<ELEMENT>(
  schema: Schema<ELEMENT>,
  skipInvalidElements: boolean,
): ArrayOutputStreamParser<ELEMENT> {
  let phase = Phase.Prefix;
  let prefix = '';
  let elementText = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let afterComma = false;
  let pending: [] | [ELEMENT] = [];
  const elements: ELEMENT[] = [];
  let publishedCount: number | undefined;

  async function finishElement() {
    const parsed = await safeParseJSON({ text: elementText });
    if (!parsed.success) {
      return false;
    }

    const validated = await safeValidateTypes({ value: parsed.value, schema });
    if (validated.success) {
      pending = [validated.value];
    } else if (!skipInvalidElements) {
      return false;
    }
    elementText = '';
    return true;
  }

  function publishPending() {
    elements.push(...pending);
    pending = [];
  }

  return async textDelta => {
    for (const char of textDelta) {
      if (phase === Phase.Prefix) {
        prefix += char;
        if (char === '[') {
          // Bound prefix scanning; other valid object shapes retain their
          // existing behavior through the stateless parser.
          if (!/^\s*\{\s*"elements"\s*:\s*\[$/.test(prefix)) {
            return 'fallback';
          }
          phase = Phase.Elements;
        } else if (prefix.length > 256) {
          return 'fallback';
        }
        continue;
      }

      if (phase === Phase.Suffix || phase === Phase.Done) {
        if (/\s/.test(char)) {
          continue;
        }
        if (phase === Phase.Suffix && char === '}') {
          publishPending();
          phase = Phase.Done;
          continue;
        }
        return 'fallback';
      }

      if (!inString && depth === 0 && (char === ',' || char === ']')) {
        if (elementText.length > 0) {
          if (!(await finishElement())) {
            return 'fallback';
          }
        } else if (char === ',' || afterComma) {
          return 'fallback';
        }
        afterComma = char === ',';
        if (char === ']') {
          phase = Phase.Suffix;
        }
        continue;
      }

      if (elementText.length === 0) {
        if (/\s/.test(char)) {
          continue;
        }
        publishPending();
        afterComma = false;
      }
      elementText += char;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
      }
    }

    if (phase === Phase.Prefix || publishedCount === elements.length) {
      return undefined;
    }

    const previousCount = publishedCount ?? 0;
    const delta =
      (publishedCount == null ? '[' : '') +
      (previousCount > 0 && elements.length > previousCount ? ',' : '') +
      elements
        .slice(previousCount)
        .map(value => JSON.stringify(value))
        .join(',') +
      (phase === Phase.Done ? ']' : '');
    publishedCount = elements.length;

    // A snapshot prevents subsequent chunks from mutating already emitted arrays.
    return { partial: elements.slice(), textDelta: delta };
  };
}
