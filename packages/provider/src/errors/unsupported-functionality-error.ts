import { AISDKError } from './ai-sdk-error';

const name = 'AI_UnsupportedFunctionalityError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class UnsupportedFunctionalityError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly functionality: string;

  constructor({ functionality }: { functionality: string }) {
    super({
      name,
      message: `'${functionality}' functionality not supported.`,
    });

    this.functionality = functionality;
  }

  static isInstance(error: unknown): error is UnsupportedFunctionalityError {
    return AISDKError.hasMarker(error, marker);
  }
}
