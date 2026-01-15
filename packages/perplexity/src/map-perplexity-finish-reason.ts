import { LanguageModelV3FinishReason } from '@ai-sdk/provider';

export function mapPerplexityFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV3FinishReason['unified'] {
  switch (finishReason) {
    case 'stop':
    case 'length':
      return finishReason;
    default:
      return 'other';
  }
}
