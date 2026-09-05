import { AISDKError } from '@ai-sdk/provider';
import type { ImageModelProviderMetadata } from '../types/image-model';
import type { ImageModelResponseMetadata } from '../types/image-model-response-metadata';
import type { ImageModelUsage } from '../types/usage';
import type { Warning } from '../types/warning';

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
   * Warnings from completed image model calls.
   */
  readonly warnings: Array<Warning> | undefined;

  /**
   * Provider-specific metadata from completed image model calls.
   */
  readonly providerMetadata: ImageModelProviderMetadata | undefined;

  /**
   * Combined token usage across completed image model calls.
   */
  readonly usage: ImageModelUsage | undefined;

  constructor({
    message = 'No image generated.',
    cause,
    responses,
    warnings,
    providerMetadata,
    usage,
  }: {
    message?: string;
    cause?: Error;
    responses?: Array<ImageModelResponseMetadata>;
    warnings?: Array<Warning>;
    providerMetadata?: ImageModelProviderMetadata;
    usage?: ImageModelUsage;
  }) {
    super({ name, message, cause });

    this.responses = responses;
    this.warnings = warnings;
    this.providerMetadata = providerMetadata;
    this.usage = usage;
  }

  static isInstance(error: unknown): error is NoImageGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
