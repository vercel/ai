import { AISDKError } from './ai-sdk-error';

const name = 'AI_NoSuchProviderReferenceError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class NoSuchProviderReferenceError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly provider: string;
  readonly availableProviders: string[];

  constructor({
    provider,
    availableProviders,
    message = `No provider reference found for provider '${provider}'. Available providers: ${availableProviders.join(', ')}`,
  }: {
    provider: string;
    availableProviders: string[];
    message?: string;
  }) {
    super({ name, message });
    this.provider = provider;
    this.availableProviders = availableProviders;
  }

  static isInstance(error: unknown): error is NoSuchProviderReferenceError {
    return AISDKError.hasMarker(error, marker);
  }
}
