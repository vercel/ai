import { getErrorMessage } from '../util/get-error-message';

export class InvalidJSONSchemaError extends Error {
  readonly cause?: unknown;
  readonly schema: unknown;

  constructor({
    cause,
    schema,
    message = `Invalid JSON schema: ${getErrorMessage(cause)}`,
  }: {
    cause?: unknown;
    schema: unknown;
    message: string;
  }) {
    super(message);

    this.name = 'AI_InvalidJSONSchemaError';

    this.cause = cause;
    this.schema = schema;
  }

  static isInvalidJSONSchemaError(
    error: unknown,
  ): error is InvalidJSONSchemaError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidJSONSchemaError' &&
      'schema' in error &&
      error.schema !== undefined
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      cause: this.cause,
      schema: this.schema,
    };
  }
}
