import {
  JSONParseError,
  JSONValue,
  TypeValidationError,
} from '@ai-sdk/provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { secureJsonParse } from './secure-json-parse';
import { safeValidateTypes, validateTypes } from './validate-types';
import { Validator } from './validator';

/**
 * Parses a JSON string into an unknown object.
 *
 * @param text - The JSON string to parse.
 * @returns {JSONValue} - The parsed JSON object.
 */
export async function parseJSON(options: {
  text: string;
  schema?: undefined;
}): Promise<JSONValue>;
/**
 * Parses a JSON string into a strongly-typed object using the provided schema.
 *
 * @template T_SCHEMA - The type of the object to parse the JSON into.
 * @param {string} text - The JSON string to parse.
 * @param {Validator<T_SCHEMA>} schema - The schema to use for parsing the JSON.
 * @returns {Promise<T_SCHEMA>} - The parsed object.
 */
export async function parseJSON<T_SCHEMA extends StandardSchemaV1>(options: {
  text: string;
  schema: T_SCHEMA | Validator<T_SCHEMA>;
}): Promise<StandardSchemaV1.InferOutput<T_SCHEMA>>;
export async function parseJSON<T_SCHEMA extends StandardSchemaV1>({
  text,
  schema,
}: {
  text: string;
  schema?: T_SCHEMA | Validator<T_SCHEMA>;
}): Promise<StandardSchemaV1.InferOutput<T_SCHEMA>> {
  try {
    const value = secureJsonParse(text);

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
  | {
      success: false;
      error: JSONParseError | TypeValidationError;
      rawValue: unknown;
    };

/**
 * Safely parses a JSON string and returns the result as an object of type `unknown`.
 *
 * @param text - The JSON string to parse.
 * @returns {Promise<object>} Either an object with `success: true` and the parsed data, or an object with `success: false` and the error that occurred.
 */
export async function safeParseJSON(options: {
  text: string;
  schema?: undefined;
}): Promise<ParseResult<JSONValue>>;
/**
 * Safely parses a JSON string into a strongly-typed object, using a provided schema to validate the object.
 *
 * @template T - The type of the object to parse the JSON into.
 * @param {string} text - The JSON string to parse.
 * @param {Validator<T>} schema - The schema to use for parsing the JSON.
 * @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
 */
export async function safeParseJSON<T extends StandardSchemaV1>(options: {
  text: string;
  schema: T | Validator<StandardSchemaV1.InferInput<T>>;
}): Promise<ParseResult<StandardSchemaV1.InferInput<T>>>;
export async function safeParseJSON<T extends StandardSchemaV1>({
  text,
  schema,
}: {
  text: string;
  schema?: T | Validator<StandardSchemaV1.InferInput<T>>;
}): Promise<ParseResult<StandardSchemaV1.InferInput<T>>> {
  try {
    const value = secureJsonParse(text);

    if (schema == null) {
      return { success: true, value: value as T, rawValue: value };
    }

    return await safeValidateTypes({ value, schema });
  } catch (error) {
    return {
      success: false,
      error: JSONParseError.isInstance(error)
        ? error
        : new JSONParseError({ text, cause: error }),
      rawValue: undefined,
    };
  }
}

export function isParsableJson(input: string): boolean {
  try {
    secureJsonParse(input);
    return true;
  } catch {
    return false;
  }
}
