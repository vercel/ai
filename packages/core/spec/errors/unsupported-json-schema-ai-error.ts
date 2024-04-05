export class UnsupportedJSONSchemaAIError extends Error {
  readonly reason: string;
  readonly schema: unknown;

  constructor({
    schema,
    reason,
    message = `Unsupported JSON schema: ${reason}`,
  }: {
    schema: unknown;
    reason: string;
    message?: string;
  }) {
    super(message);

    this.name = 'UnsupportedJSONSchemaAIError';

    this.reason = reason;
    this.schema = schema;
  }

  static isUnsupportedJSONSchemaAIError(
    error: unknown,
  ): error is UnsupportedJSONSchemaAIError {
    return (
      error instanceof Error &&
      error.name === 'UnsupportedJSONSchemaAIError' &&
      'reason' in error &&
      error.reason != undefined &&
      'schema' in error &&
      error.schema !== undefined
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      reason: this.reason,
      schema: this.schema,
    };
  }
}
