import { LanguageModelV2FinishReason } from '@ai-sdk/provider';

export function mapPerplexityFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV2FinishReason {
  switch (finishReason) {
    case 'stop':
    case 'length':
      return finishReason;
    default:
      return 'unknown';
  }
}
