import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Schema } from './Schema';

export function zodSchema<OBJECT>(zodSchema: z.Schema<OBJECT>) {
  return new ZodSchema(zodSchema);
}

export class ZodSchema<OBJECT> implements Schema<OBJECT> {
  readonly zodSchema: z.Schema<OBJECT>;

  constructor(zodSchema: z.Schema<OBJECT>) {
    this.zodSchema = zodSchema;
  }

  validate(
    value: unknown,
  ): { success: true; value: OBJECT } | { success: false; error: unknown } {
    const result = this.zodSchema.safeParse(value);

    return result.success
      ? { success: true, value: result.data }
      : { success: false, error: result.error };
  }

  getJsonSchema(): unknown {
    return zodToJsonSchema(this.zodSchema);
  }

  /**
   * Use only for typing purposes. The value is always `undefined`.
   */
  readonly _type!: OBJECT;
}
