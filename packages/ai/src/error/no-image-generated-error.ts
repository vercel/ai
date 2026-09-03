import {
  AISDKError,
  type ImageModelV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { GenerateImageCall } from '../generate-image/generate-image-result';
import type { ImageModelResponseMetadata } from '../types/image-model-response-metadata';
import type { ImageModelUsage } from '../types/usage';

const name = 'AI_NoImageGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when no image could be generated. This can have multiple causes:
 *
 * - The model failed to generate a response.
 * - The model generated a response that could not be parsed.
 */
export class NoImageGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
   * The response metadata for each call.
   */
  readonly responses: Array<ImageModelResponseMetadata> | undefined;

  /**
   * The results of the underlying image model calls.
   */
  readonly calls: Array<GenerateImageCall> | undefined;

  /**
   * Combined token usage across all image model calls.
   */
  readonly usage: ImageModelUsage | undefined;

  /**
   * Provider-specific metadata reported by the image model.
   */
  readonly providerMetadata: ImageModelV4ProviderMetadata | undefined;

  constructor({
    message = 'No image generated.',
    cause,
    responses,
    calls,
    usage,
    providerMetadata,
  }: {
    message?: string;
    cause?: unknown;
    responses?: Array<ImageModelResponseMetadata>;
    calls?: Array<GenerateImageCall>;
    usage?: ImageModelUsage;
    providerMetadata?: ImageModelV4ProviderMetadata;
  }) {
    super({ name, message, cause });

    this.responses = responses;
    this.calls = calls;
    this.usage = usage;
    this.providerMetadata = providerMetadata;
  }

  static isInstance(error: unknown): error is NoImageGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
