import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_ProviderError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class ProviderError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly provider: string;

  constructor({
    message,
    cause,
    provider,
  }: {
    message: string;
    cause: unknown;
    provider: string;
  }) {
    super({
      name,
      message: `${provider} provider: ${message}`,
      cause,
    });

    this.provider = provider;
  }

  static isInstance(error: unknown): error is ProviderError {
    return AISDKError.hasMarker(error, marker);
  }
}
