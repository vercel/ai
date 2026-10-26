import { AISDKError } from '@ai-sdk/provider';
import type { LanguageModelUsage } from '../types/usage';

const name = 'AI_CompactionError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export type CompactionErrorCode =
  | 'INVALID_OPTIONS'
  | 'INVALID_CHECKPOINT'
  | 'FIXED_CONTEXT_TOO_LARGE'
  | 'SUMMARY_REQUIRED'
  | 'SUMMARY_INPUT_TOO_LARGE'
  | 'EMPTY_SUMMARY'
  | 'INVALID_MESSAGES'
  | 'TARGET_NOT_REACHED'
  | 'MEASUREMENT_UNAVAILABLE';

export class CompactionError extends AISDKError {
  private readonly [symbol] = true;
  readonly code: CompactionErrorCode;
  usage?: LanguageModelUsage;

  constructor({
    code,
    message,
    cause,
    usage,
  }: {
    code: CompactionErrorCode;
    message: string;
    cause?: unknown;
    usage?: LanguageModelUsage;
  }) {
    super({ name, message, cause });
    this.code = code;
    this.usage = usage;
  }

  static isInstance(error: unknown): error is CompactionError {
    return AISDKError.hasMarker(error, marker);
  }
}
