export class InvalidArgumentError extends Error {
  readonly parameter: string;
  readonly value: unknown;

  constructor({
    parameter,
    value,
    message,
  }: {
    parameter: string;
    value: unknown;
    message: string;
  }) {
    super(`Invalid argument for parameter ${parameter}: ${message}`);

    this.name = 'AI_InvalidArgumentError';

    this.parameter = parameter;
    this.value = value;
  }

  static isInvalidArgumentError(error: unknown): error is InvalidArgumentError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidArgumentError' &&
      typeof (error as InvalidArgumentError).parameter === 'string' &&
      typeof (error as InvalidArgumentError).value === 'string'
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
