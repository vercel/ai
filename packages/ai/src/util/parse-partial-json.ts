import type { JSONValue } from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { fixJsonWithMetadata } from './fix-json';

type ParsePartialJsonResult = {
  value: JSONValue | undefined;
  state:
    | 'undefined-input'
    | 'successful-parse'
    | 'repaired-parse'
    | 'failed-parse';
};

export async function parsePartialJson(
  jsonText: string | undefined,
): Promise<ParsePartialJsonResult> {
  const { hasUnclosedArray: _, ...result } =
    await parsePartialJsonWithRepairInfo(jsonText);

  return result;
}

export async function parsePartialJsonWithRepairInfo(
  jsonText: string | undefined,
): Promise<ParsePartialJsonResult & { hasUnclosedArray: boolean }> {
  if (jsonText === undefined) {
    return {
      value: undefined,
      state: 'undefined-input',
      hasUnclosedArray: false,
    };
  }

  let result = await safeParseJSON({ text: jsonText });

  if (result.success) {
    return {
      value: result.value,
      state: 'successful-parse',
      hasUnclosedArray: false,
    };
  }

  const repair = fixJsonWithMetadata(jsonText);
  result = await safeParseJSON({ text: repair.value });

  if (result.success) {
    return {
      value: result.value,
      state: 'repaired-parse',
      hasUnclosedArray: repair.hasUnclosedArray,
    };
  }

  return {
    value: undefined,
    state: 'failed-parse',
    hasUnclosedArray: repair.hasUnclosedArray,
  };
}
