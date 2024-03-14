/**
 * Validates that the structure of a value matches this schema.
 */
export interface Schema<OBJECT> {
  /**
   * Validates that the structure of a value matches this schema,
   * and returns a typed version of the value if it does.
   */
  validate(
    value: unknown,
  ): { success: true; value: OBJECT } | { success: false; error: unknown };

  /**
   * Returns the JSON schema for this schema. The schema has to be a valid JSON schema in object form.
   */
  getJsonSchema(): Record<string, unknown>;

  /**
   * Use only for typing inference. The value is always `undefined`.
   */
  readonly _type: OBJECT;
}
