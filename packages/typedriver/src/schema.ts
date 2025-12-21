import { jsonSchema, Schema } from '@ai-sdk/provider-utils';
import compile, {
  type Static,
  type TErrorOptions,
  type TJsonSchemaError,
  type TStandardSchemaError,
} from 'typedriver';

/**
 * Error thrown when schema validation fails.
 *
 * Contains one or more underlying schema errors produced during validation.
 * The error message is derived from the first error when available.
 */
export class ValidationError extends Error {
  constructor(public readonly errors: (TJsonSchemaError | TStandardSchemaError)[]) {
    super(errors.length === 0 ? 'Unknown error' : errors[0].message)
  }
}
/**
 * Converts a schema definition into an SDK compatible `Schema<T>`.
 *
 * Supported Schema Definitions:
 * - TypeScript DSL
 * - JSON Schema
 * - Standard JSON Schema
 *
 * @param input JSON Schema, Standard JSON Schema or TypeScript DSL string.
 * @param options Error formatting and localization options.
 * @returns An AI SDK compatible `Schema<T>` instance.
 * @example
 * ```ts
 * const S = schema('string')
 * ```
 * @example
 * ```ts
 * const S = schema({ type: 'string' })
 * ```
 * @example
 * ```ts
 * const S = schema(z.string())
 * ```
 */
export function schema<const Input extends unknown,
  Output extends unknown = Static<Input>
>(input: Input, options: TErrorOptions = { format: 'json-schema', locale: 'en_US' }):
  Schema<Output> {
  const validator = compile(input)
  if (!validator.isJsonSchema()) {
    throw Error('Schema is not TypeScript, JSON Schema or Standard JSON Schema')
  }
  return jsonSchema(validator.toJsonSchema() as Record<string, unknown>, {
    validate: value => validator.check(value)
      ? { success: true, value }
      : { success: false, error: new ValidationError(validator.errors(value, options)) },
  }) as never
}