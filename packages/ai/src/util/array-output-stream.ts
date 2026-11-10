import {
  safeParseJSON,
  safeValidateTypes,
  type Schema,
} from '@ai-sdk/provider-utils';
import type { Output } from '../generate-text/output';

export type ArrayOutputStreamParser<ELEMENT> = (
  textDelta: string,
) => Promise<
  { partial: ELEMENT[]; textDelta: string } | undefined | 'fallback'
>;

// Parser state belongs to a stream, not to the reusable output specification.
export const arrayStreamParserFactories = new WeakMap<
  Output,
  {
    parsePartialOutput: Output['parsePartialOutput'];
    create: () => ArrayOutputStreamParser<any>;
  }
>();

export function createArrayStreamParser(output: Output) {
  const factory = arrayStreamParserFactories.get(output);
  return factory?.parsePartialOutput === output.parsePartialOutput
    ? factory.create()
    : undefined;
}

/**
 * Scan only new text and parse/validate each delimited element once. Keep the
 * last element pending until another starts or the enclosing object closes,
 * matching the partial JSON parser's treatment of an incomplete response.
 * Nonstandard envelopes and malformed JSON use the existing partial parser.
 */
export function createArrayOutputStreamParser<ELEMENT>({
  schema,
  skipInvalidElements,
}: {
  schema: Schema<ELEMENT>;
  skipInvalidElements: boolean;
}): ArrayOutputStreamParser<ELEMENT> {
  let phase: 'prefix' | 'array' | 'suffix' | 'done' | 'fallback' = 'prefix';
  let prefix = '';
  let elementText = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let afterComma = false;
  let pending: { value: ELEMENT } | undefined;
  const elements: ELEMENT[] = [];
  let publishedCount: number | undefined;

  async function finishElement() {
    const parsed = await safeParseJSON({ text: elementText });
    if (!parsed.success) {
      return false;
    }

    const validated = await safeValidateTypes({ value: parsed.value, schema });
    if (validated.success) {
      pending = { value: validated.value };
    } else if (!skipInvalidElements) {
      return false;
    }
    elementText = '';
    return true;
  }

  function publishPending() {
    if (pending != null) {
      elements.push(pending.value);
      pending = undefined;
    }
  }

  return async textDelta => {
    for (const char of textDelta) {
      if (phase === 'fallback') {
        return 'fallback';
      }

      if (phase === 'prefix') {
        prefix += char;
        if (char === '[') {
          // Bound prefix scanning; other valid object shapes retain their
          // existing behavior through the stateless parser.
          if (!/^\s*\{\s*"elements"\s*:\s*\[$/.test(prefix)) {
            phase = 'fallback';
            return 'fallback';
          }
          phase = 'array';
        } else if (prefix.length > 256) {
          phase = 'fallback';
          return 'fallback';
        }
        continue;
      }

      if (phase === 'suffix' || phase === 'done') {
        if (/\s/.test(char)) {
          continue;
        }
        if (phase === 'suffix' && char === '}') {
          publishPending();
          phase = 'done';
          continue;
        }
        phase = 'fallback';
        return 'fallback';
      }

      if (!inString && depth === 0 && (char === ',' || char === ']')) {
        if (elementText.length > 0) {
          if (!(await finishElement())) {
            phase = 'fallback';
            return 'fallback';
          }
        } else if (char === ',' || afterComma) {
          phase = 'fallback';
          return 'fallback';
        }
        afterComma = char === ',';
        if (char === ']') {
          phase = 'suffix';
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

    if (phase === 'prefix' || publishedCount === elements.length) {
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
      (phase === 'done' ? ']' : '');
    publishedCount = elements.length;

    // A snapshot prevents subsequent chunks from mutating already emitted arrays.
    return { partial: elements.slice(), textDelta: delta };
  };
}
