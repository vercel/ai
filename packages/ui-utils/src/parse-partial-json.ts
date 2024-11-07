import { JSONValue } from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { fixJson } from './fix-json';

export function parsePartialJson(jsonText: string | undefined): {
  value: JSONValue | undefined;
  state:
    | 'undefined-input'
    | 'successful-parse'
    | 'repaired-parse'
    | 'failed-parse';
} {
  if (jsonText === undefined) {
    return { value: undefined, state: 'undefined-input' };
  }

  let result = safeParseJSON({ text: jsonText });

  if (result.success) {
    return { value: result.value, state: 'successful-parse' };
  }

  result = safeParseJSON({ text: fixJson(jsonText) });

  if (result.success) {
    return { value: result.value, state: 'repaired-parse' };
  }

  return { value: undefined, state: 'failed-parse' };
}
