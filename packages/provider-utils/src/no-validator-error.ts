import { AISDKError } from '@ai-sdk/provider';
import { Validator } from './validator';

const name = 'AI_NoValidatorError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when a validator function is undefined, but required.
 */
export class NoValidatorError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly value: unknown;
  readonly validator: Validator<unknown>;

  constructor({
    value,
    validator,
  }: {
    value: unknown;
    validator: Validator<unknown>;
  }) {
    super({
      name,
      message: 'Mandatory validator function is undefined.',
    });

    this.value = value;
    this.validator = validator;
  }

  static isInstance(error: unknown): error is NoValidatorError {
    return AISDKError.hasMarker(error, marker);
  }
}
