import { JSONParseError, TypeValidationError } from '@ai-sdk/provider';
import SecureJSON from 'secure-json-parse';
import { ZodSchema } from 'zod';
import { safeValidateTypes, validateTypes } from './validate-types';

/**
 * Parses a JSON string into an unknown object.
 *
 * @param text - The JSON string to parse.
 * @returns {unknown} - The parsed JSON object.
 */
export function parseJSON({ text }: { text: string }): unknown;
/**
 * Parses a JSON string into a strongly-typed object using the provided schema.
 *
 * @template T - The type of the object to parse the JSON into.
 * @param {string} text - The JSON string to parse.
 * @param {Schema<T>} schema - The schema to use for parsing the JSON.
 * @returns {T} - The parsed object.
 */
export function parseJSON<T>({
  text,
  schema,
}: {
  text: string;
  schema: ZodSchema<T>;
}): T;
export function parseJSON<T>({
  text,
  schema,
}: {
  text: string;
  schema?: ZodSchema<T>;
}): T {
  try {
    const value = SecureJSON.parse(text);

    if (schema == null) {
      return value;
    }

    return validateTypes({ value, schema });
  } catch (error) {
    if (
      JSONParseError.isJSONParseError(error) ||
      TypeValidationError.isTypeValidationError(error)
    ) {
      throw error;
    }

    throw new JSONParseError({ text, cause: error });
  }
}

export type ParseResult<T> =
  | { success: true; value: T }
  | { success: false; error: JSONParseError | TypeValidationError };

/**
 * Safely parses a JSON string and returns the result as an object of type `unknown`.
 *
 * @param text - The JSON string to parse.
 * @returns {object} Either an object with `success: true` and the parsed data, or an object with `success: false` and the error that occurred.
 */
export function safeParseJSON({ text }: { text: string }): ParseResult<unknown>;
/**
 * Safely parses a JSON string into a strongly-typed object, using a provided schema to validate the object.
 *
 * @template T - The type of the object to parse the JSON into.
 * @param {string} text - The JSON string to parse.
 * @param {Schema<T>} schema - The schema to use for parsing the JSON.
 * @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
 */
export function safeParseJSON<T>({
  text,
  schema,
}: {
  text: string;
  schema: ZodSchema<T>;
}): ParseResult<T>;
export function safeParseJSON<T>({
  text,
  schema,
}: {
  text: string;
  schema?: ZodSchema<T>;
}):
  | { success: true; value: T }
  | { success: false; error: JSONParseError | TypeValidationError } {
  try {
    const value = SecureJSON.parse(text);

    if (schema == null) {
      return {
        success: true,
        value: value as T,
      };
    }

    return safeValidateTypes({ value, schema });
  } catch (error) {
    return {
      success: false,
      error: JSONParseError.isJSONParseError(error)
        ? error
        : new JSONParseError({ text, cause: error }),
    };
  }
}

export function isParseableJson(input: string): boolean {
  try {
    SecureJSON.parse(input);
    return true;
  } catch {
    return false;
  }
}
