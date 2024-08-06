import { AISDKError } from '@ai-sdk/provider';

const marker = 'vercel.ai.error.invalid-argument-error';
const symbol = Symbol.for(marker);

export class InvalidArgumentError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

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
    super({
      name: 'AI_InvalidArgumentError',
      message: `Invalid argument for parameter ${parameter}: ${message}`,
    });

    this.parameter = parameter;
    this.value = value;
  }

  static isInstance(error: unknown): error is InvalidArgumentError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
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
