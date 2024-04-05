export class InvalidArgumentAIError extends Error {
  readonly parameter: string;
  readonly value: unknown;

  constructor({
    parameter,
    value,
    message = `Invalid argument for parameter ${parameter}: ${JSON.stringify(
      value,
    )}`,
  }: {
    parameter: string;
    value: unknown;
    message: string;
  }) {
    super(message);

    this.name = 'InvalidArgumentAIError';

    this.parameter = parameter;
    this.value = value;
  }

  static isInvalidArgumentAIError(
    error: unknown,
  ): error is InvalidArgumentAIError {
    return (
      error instanceof Error &&
      error.name === 'InvalidArgumentAIError' &&
      'parameter' in error &&
      typeof error.parameter === 'string' &&
      'value' in error &&
      typeof error.value === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      parameter: this.parameter,
      value: this.value,
    };
  }
}
