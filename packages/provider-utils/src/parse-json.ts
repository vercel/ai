import {
  JSONParseError,
  JSONValue,
  TypeValidationError,
} from '@ai-sdk/provider';
import SecureJSON from 'secure-json-parse';
import { ZodSchema } from 'zod';
import { safeValidateTypes, validateTypes } from './validate-types';
import { Validator } from './validator';

/**
 * Parses a JSON string into an unknown object.
 *
 * @param text - The JSON string to parse.
 * @returns {JSONValue} - The parsed JSON object.
 */
export function parseJSON(options: {
  text: string;
  schema?: undefined;
}): JSONValue;
/**
 * Parses a JSON string into a strongly-typed object using the provided schema.
 *
 * @template T - The type of the object to parse the JSON into.
 * @param {string} text - The JSON string to parse.
 * @param {Validator<T>} schema - The schema to use for parsing the JSON.
 * @returns {T} - The parsed object.
 */
export function parseJSON<T>(options: {
  text: string;
  schema: ZodSchema<T> | Validator<T>;
}): T;
export function parseJSON<T>({
  text,
  schema,
}: {
  text: string;
  schema?: ZodSchema<T> | Validator<T>;
}): T {
  try {
    const value = SecureJSON.parse(text);

    if (schema == null) {
      return value;
    }

    return validateTypes({ value, schema });
  } catch (error) {
    if (
      JSONParseError.isInstance(error) ||
      TypeValidationError.isInstance(error)
    ) {
      throw error;
    }

    throw new JSONParseError({ text, cause: error });
  }
}

export type ParseResult<T> =
  | { success: true; value: T; rawValue: unknown }
  | { success: false; error: JSONParseError | TypeValidationError };

/**
 * Safely parses a JSON string and returns the result as an object of type `unknown`.
 *
 * @param text - The JSON string to parse.
 * @param {boolean} tryMutipleBraceVariations - Whether to try multiple variations of the JSON string to fix potential issues with missing or extra braces.
 * @returns {object} Either an object with `success: true` and the parsed data, or an object with `success: false` and the error that occurred.
 */
export function safeParseJSON(options: {
  text: string;
  schema?: undefined;
  tryMutipleBraceVariations?: boolean;
}): ParseResult<JSONValue>;
/**
 * Safely parses a JSON string into a strongly-typed object, using a provided schema to validate the object.
 *
 * @template T - The type of the object to parse the JSON into.
 * @param {string} text - The JSON string to parse.
 * @param {Validator<T>} schema - The schema to use for parsing the JSON.
 * @param {boolean} tryMutipleBraceVariations - Whether to try multiple variations of the JSON string to fix potential issues with missing or extra braces.
 * @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
 */
export function safeParseJSON<T>(options: {
  text: string;
  schema: ZodSchema<T> | Validator<T>;
  tryMutipleBraceVariations?: boolean;
}): ParseResult<T>;
export function safeParseJSON<T>({
  text,
  schema,
  tryMutipleBraceVariations,
}: {
  text: string;
  schema?: ZodSchema<T> | Validator<T>;
  tryMutipleBraceVariations?: boolean;
}): ParseResult<T> {
  const numberOfBraceVariations = tryMutipleBraceVariations ? 5 : 0;

  const values: { success: boolean; json?: unknown; error?: unknown }[] = [];
  for (const maybeJson of generateJSONBraceVariations(
    text,
    numberOfBraceVariations,
  )) {
    try {
      values.push({
        success: true,
        json: SecureJSON.parse(maybeJson),
      } as const);
      break;
    } catch (error) {
      values.push({ success: false, error } as const);
    }
  }

  const value = values.find(v => v.success);
  if (value == null) {
    const error = values[0].error; // the one with the original number of braces
    return {
      success: false,
      error: JSONParseError.isInstance(error)
        ? error
        : new JSONParseError({ text, cause: error }),
    };
  }

  if (schema == null) {
    return { success: true, value: value.json as T, rawValue: value.json };
  }
  try {
    const validationResult = safeValidateTypes({ value: value.json, schema });

    return validationResult.success
      ? { ...validationResult, rawValue: value.json }
      : validationResult;
  } catch (error) {
    return {
      success: false,
      error: JSONParseError.isInstance(error)
        ? error
        : new JSONParseError({ text, cause: error }),
    };
  }
}

export function isParsableJson(input: string): boolean {
  try {
    SecureJSON.parse(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates variations of a potentially incomplete JSON string by adding or removing closing braces.
 * Useful for attempting to fix malformed JSON that might be missing closing braces or have too many.
 *
 * @param incompleteJSON The potentially malformed JSON string
 * @param n The number of braces to add/remove in each direction
 * @returns Array of strings with different numbers of closing braces, centered around the original string
 *
 * Example:
 * Input: `generateJSONBraceVariations(1, '{"foo": "bar"')`
 * Output: `[
 *   '{"foo": "bar"',    // +0 brace (original)
 *   '{"foo": "bar',     // -1 brace
 *   '{"foo": "bar"}',   // +1 brace (might be valid JSON)
 * ]`
 */
function generateJSONBraceVariations(
  incompleteJSON: string,
  n: number,
): string[] {
  const result: string[] = [incompleteJSON];
  for (let i = n; i > 0; i--) {
    result.push(incompleteJSON.slice(0, -i));
  }
  for (let i = 1; i <= n; i++) {
    result.push(incompleteJSON + '}'.repeat(i));
  }
  return result;
}
