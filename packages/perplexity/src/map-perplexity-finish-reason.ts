import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

export function mapPerplexityFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'stop':
    case 'length':
      return finishReason;
    default:
      return 'unknown';
  }
}
