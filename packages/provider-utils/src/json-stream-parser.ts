import { JSONParseError, TypeValidationError } from '@ai-sdk/provider';
import { safeParse } from 'zod/v4';
import { globalConfig, type $ZodType } from 'zod/v4/core';
import type { ParseResult } from './parse-json';
import { secureJsonParse } from './secure-json-parse';
import { safeValidateTypes } from './validate-types';
import { zodSchema } from './schema';

export type JsonSchemaCompiler = <T extends $ZodType>(
  schema: T,
  options: { strict: true },
) => T;

// Only for manually audited, callback-free SDK response schemas.
// Compiler success does not establish synchrony or purity.
export class JsonStreamParser<T> {
  private target: $ZodType<T> | null | undefined;
  private readonly schema;

  constructor(
    private readonly rawSchema: $ZodType<T>,
    private readonly compiler: JsonSchemaCompiler,
  ) {
    this.schema = zodSchema(rawSchema);
  }

  async parse(text: string): Promise<ParseResult<T>> {
    let value: unknown;
    try {
      if (typeof text !== 'string') {
        throw new TypeError('JSON stream parsing requires text');
      }
      value = secureJsonParse(text);
    } catch (cause) {
      return {
        success: false,
        error: new JSONParseError({ text, cause }),
        rawValue: undefined,
      };
    }

    // Check policy on every parse, including after a compiled target is cached.
    if (globalConfig.jitless) {
      return safeValidateTypes({ value, schema: this.schema });
    }

    if (this.target === undefined) {
      try {
        this.target = this.compiler(this.rawSchema, { strict: true });
      } catch {
        this.target = null;
      }
    }

    if (this.target != null) {
      try {
        const result = safeParse(this.target, value);
        if (result.success) {
          return { success: true, value: result.data, rawValue: value };
        }
        return {
          success: false,
          error: TypeValidationError.wrap({ value, cause: result.error }),
          rawValue: value,
        };
      } catch (cause) {
        return {
          success: false,
          error: TypeValidationError.wrap({ value, cause }),
          rawValue: value,
        };
      }
    }

    return safeValidateTypes({ value, schema: this.schema });
  }
}
