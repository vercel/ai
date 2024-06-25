import SecureJSON from 'secure-json-parse';
import { fixJson } from './fix-json';

export function parsePartialJson(
  jsonText: string | undefined,
): unknown | undefined {
  if (jsonText == null) {
    return undefined;
  }

  try {
    // first attempt a regular JSON parse:
    return SecureJSON.parse(jsonText);
  } catch (ignored) {
    try {
      // then try to fix the partial JSON and parse it:
      const fixedJsonText = fixJson(jsonText);
      return SecureJSON.parse(fixedJsonText);
    } catch (ignored) {
      // ignored
    }
  }

  return undefined;
}
