import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_NoSuchProviderError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class NoSuchProviderError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly providerId: string;
  readonly availableProviders: string[];

  constructor({
    providerId,
    availableProviders,
    message = `No such provider: ${providerId} (available providers: ${availableProviders.join()})`,
  }: {
    providerId: string;
    availableProviders: string[];
    message?: string;
  }) {
    super({ name, message });

    this.providerId = providerId;
    this.availableProviders = availableProviders;
  }

  static isInstance(error: unknown): error is NoSuchProviderError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isNoSuchProviderError(error: unknown): error is NoSuchProviderError {
    return (
      error instanceof Error &&
      error.name === name &&
      typeof (error as NoSuchProviderError).providerId === 'string' &&
      Array.isArray((error as NoSuchProviderError).availableProviders)
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      providerId: this.providerId,
      availableProviders: this.availableProviders,
    };
  }
}
