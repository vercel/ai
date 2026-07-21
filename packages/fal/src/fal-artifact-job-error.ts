import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_FalArtifactJobError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);
const submissionErrorName = 'AI_FalArtifactSubmissionError';
const submissionErrorMarker = `vercel.ai.error.${submissionErrorName}`;
const submissionErrorSymbol = Symbol.for(submissionErrorMarker);

/**
 * An artifact generation error that happened after Fal accepted the job.
 * Consumers can use `jobAccepted` to avoid submitting the same billable work
 * to a fallback provider.
 */
export class FalArtifactJobError extends AISDKError {
  private readonly [symbol] = true;

  readonly jobAccepted = true as const;
  readonly requestId: string | undefined;

  constructor({
    message,
    requestId,
    cause,
  }: {
    message: string;
    requestId?: string;
    cause?: unknown;
  }) {
    super({ name, message, cause });
    this.requestId = requestId;
  }

  static isInstance(error: unknown): error is FalArtifactJobError {
    return AISDKError.hasMarker(error, marker);
  }
}

/**
 * An artifact generation error raised after a Fal queue submission was sent,
 * but before the client received a response that proves whether Fal accepted
 * it. Consumers should fail closed instead of submitting a fallback, since the
 * original request may already be running and billable.
 */
export class FalArtifactSubmissionError extends AISDKError {
  private readonly [submissionErrorSymbol] = true;

  readonly jobMayHaveBeenAccepted = true as const;

  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super({ name: submissionErrorName, message, cause });
  }

  static isInstance(error: unknown): error is FalArtifactSubmissionError {
    return AISDKError.hasMarker(error, submissionErrorMarker);
  }
}
