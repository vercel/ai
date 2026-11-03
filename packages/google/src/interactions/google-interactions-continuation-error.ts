import {
  AISDKError,
  type LanguageModelV4GenerateResult,
} from '@ai-sdk/provider';

const name = 'AI_GoogleInteractionsContinuationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/** A continuation failed after Google had already produced output. */
export class GoogleInteractionsContinuationError extends AISDKError {
  private readonly [symbol] = true;

  /** Completed hops, including their combined content and usage. Not set for streams. */
  readonly partialResult?: LanguageModelV4GenerateResult;
  readonly continuationToken: string;
  /** The interaction that issued the token. Absent for stateless requests. */
  readonly interactionId?: string;

  constructor({
    cause,
    continuationToken,
    interactionId,
    partialResult,
  }: {
    cause: unknown;
    continuationToken: string;
    interactionId?: string;
    partialResult?: LanguageModelV4GenerateResult;
  }) {
    super({
      name,
      message:
        'Google Interactions continuation was interrupted. Resume with the continuation token and its interaction id, or the original input when store is false. For streams, output delivered after the checkpoint will be generated again.',
      cause,
    });
    this.continuationToken = continuationToken;
    this.interactionId = interactionId;
    this.partialResult = partialResult;
  }

  static isInstance(
    error: unknown,
  ): error is GoogleInteractionsContinuationError {
    return AISDKError.hasMarker(error, marker);
  }
}
