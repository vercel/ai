export class UnsupportedJSONSchemaAIError extends Error {
  readonly provider: string;
  readonly reason: string;
  readonly schema: unknown;

  constructor({
    provider,
    schema,
    reason,
    message = `Unsupported JSON schema: ${reason}`,
  }: {
    provider: string;
    schema: unknown;
    reason: string;
    message?: string;
  }) {
    super(message);

    this.name = 'UnsupportedJSONSchemaAIError';

    this.provider = provider;
    this.reason = reason;
    this.schema = schema;
  }

  static isUnsupportedJSONSchemaAIError(
    error: unknown,
  ): error is UnsupportedJSONSchemaAIError {
    return (
      error instanceof Error &&
      error.name === 'UnsupportedJSONSchemaAIError' &&
      'provider' in error &&
      error.provider != undefined &&
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

      provider: this.provider,
      reason: this.reason,
      schema: this.schema,
    };
  }
}
