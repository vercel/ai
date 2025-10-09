import { LanguageModelV3FinishReason } from '@ai-sdk/provider';

export function mapParallelFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV3FinishReason {
  switch (finishReason) {
    case 'stop':
    case 'length':
      return finishReason;
    default:
      return 'unknown';
  }
}

