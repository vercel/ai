import { JSONValue } from '@ai-sdk/provider';
import SecureJSON from 'secure-json-parse';
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

  try {
    // first attempt a regular JSON parse:
    return {
      value: SecureJSON.parse(jsonText),
      state: 'successful-parse',
    };
  } catch (ignored) {
    try {
      // then try to fix the partial JSON and parse it:
      return {
        value: SecureJSON.parse(fixJson(jsonText)),
        state: 'repaired-parse',
      };
    } catch (ignored) {
      // ignored
    }
  }

  return { value: undefined, state: 'failed-parse' };
}
