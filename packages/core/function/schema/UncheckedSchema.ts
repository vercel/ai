import { Schema } from './Schema';

export function uncheckedSchema<OBJECT>(jsonSchema?: unknown) {
  return new UncheckedSchema<OBJECT>(jsonSchema);
}

export class UncheckedSchema<OBJECT> implements Schema<OBJECT> {
  constructor(private readonly jsonSchema?: unknown) {}

  validate(
    value: unknown,
  ): { success: true; value: OBJECT } | { success: false; error: unknown } {
    return { success: true, value: value as OBJECT };
  }

  getJsonSchema(): unknown {
    return this.jsonSchema;
  }

  readonly _type!: OBJECT;
}
