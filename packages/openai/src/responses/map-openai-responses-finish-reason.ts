import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

export function mapOpenAIResponseFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case undefined:
    case null:
      return 'stop';
    case 'max_output_tokens':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    default:
      return 'unknown';
  }
}
