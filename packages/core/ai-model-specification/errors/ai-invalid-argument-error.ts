export class AI_InvalidArgumentError extends Error {
  readonly parameter: string;
  readonly value: unknown;
  // readonly learnMore =
  //   'https://sdk.vercel.com/docs/ai/errors/ai_invalid_argument_error';

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
