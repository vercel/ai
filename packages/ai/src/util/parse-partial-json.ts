import type { JSONValue } from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { repairJson } from './fix-json';

export async function parsePartialJson(jsonText: string | undefined): Promise<{
  value: JSONValue | undefined;
  state:
    | 'undefined-input'
    | 'successful-parse'
    | 'repaired-parse'
    | 'failed-parse';
}> {
  if (jsonText === undefined) {
    return { value: undefined, state: 'undefined-input' };
  }

  const repaired = repairJson(jsonText);

  // While streaming, the text almost always ends inside an unclosed string,
  // object, or array. Parsing it as-is would always fail, so skip that attempt.
  if (!repaired.isTruncated) {
    const result = await safeParseJSON({ text: jsonText });

    if (result.success) {
      return { value: result.value, state: 'successful-parse' };
    }
  }

  const result = await safeParseJSON({ text: repaired.text });

  if (result.success) {
    return { value: result.value, state: 'repaired-parse' };
  }

  return { value: undefined, state: 'failed-parse' };
}
