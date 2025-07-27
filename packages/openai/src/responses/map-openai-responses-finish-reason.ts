import { LanguageModelV2FinishReason } from '@ai-sdk/provider';

export function mapOpenAIResponseFinishReason({
  finishReason,
  hasToolCalls,
}: {
  finishReason: string | null | undefined;
  hasToolCalls: boolean;
}): LanguageModelV2FinishReason {
  switch (finishReason) {
    case undefined:
    case null:
      return hasToolCalls ? 'tool-calls' : 'stop';
    case 'max_output_tokens':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    default:
      return hasToolCalls ? 'tool-calls' : 'unknown';
  }
}
