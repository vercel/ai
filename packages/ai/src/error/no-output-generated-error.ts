import { AISDKError, type SharedV4ProviderMetadata } from '@ai-sdk/provider';
import type { FinishReason } from '../types/language-model';
import type { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import type { LanguageModelUsage } from '../types/usage';

const name = 'AI_NoOutputGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when no LLM output was generated, e.g. because of errors.
 */
export class NoOutputGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly response:
    | Omit<LanguageModelResponseMetadata, 'messages'>
    | undefined;
  readonly usage: LanguageModelUsage | undefined;
  readonly finishReason: FinishReason | undefined;
  readonly providerMetadata: SharedV4ProviderMetadata | undefined;

  constructor({
    message = 'No output generated.',
    cause,
    response,
    usage,
    finishReason,
    providerMetadata,
  }: {
    message?: string;
    cause?: unknown;
    response?: Omit<LanguageModelResponseMetadata, 'messages'>;
    usage?: LanguageModelUsage;
    finishReason?: FinishReason;
    providerMetadata?: SharedV4ProviderMetadata;
  } = {}) {
    super({ name, message, cause });

    this.response = response;
    this.usage = usage;
    this.finishReason = finishReason;
    this.providerMetadata = providerMetadata;
  }

  static isInstance(error: unknown): error is NoOutputGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
