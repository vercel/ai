import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_AmazonTranscribeError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error thrown when the Amazon Transcribe API returns an error or a
 * transcription job cannot be completed.
 */
export class AmazonTranscribeError extends AISDKError {
  private readonly [symbol] = true;

  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super({ name, message, cause });
  }

  static isInstance(error: unknown): error is AmazonTranscribeError {
    return AISDKError.hasMarker(error, marker);
  }
}
