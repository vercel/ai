import { AISDKError } from '@ai-sdk/provider';
import type { GoogleInteractionsResponse } from './google-interactions-api';

const name = 'AI_GoogleInteractionsContinuationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/** A foreground continuation failed after the server produced resumable output. */
export class GoogleInteractionsContinuationError extends AISDKError {
  private readonly [symbol] = true;

  readonly continuationToken: string | undefined;
  readonly interactionId: string | undefined;
  /** Completed hops merged together. Streaming output has already been emitted. */
  readonly partialInteraction: GoogleInteractionsResponse | undefined;

  constructor({
    cause,
    continuationToken,
    interactionId,
    partialInteraction,
  }: {
    cause: unknown;
    continuationToken?: string;
    interactionId?: string;
    partialInteraction?: GoogleInteractionsResponse;
  }) {
    super({
      name,
      message: 'Google Interactions automatic continuation was interrupted.',
      cause,
    });
    this.continuationToken = continuationToken;
    this.interactionId = interactionId;
    this.partialInteraction = partialInteraction;
  }

  static isInstance(
    error: unknown,
  ): error is GoogleInteractionsContinuationError {
    return AISDKError.hasMarker(error, marker);
  }
}
