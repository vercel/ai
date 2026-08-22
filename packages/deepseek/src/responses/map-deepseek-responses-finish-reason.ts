import type { LanguageModelV4FinishReason } from '@ai-sdk/provider';

export function mapDeepSeekResponsesFinishReason({
  incompleteReason,
  hasToolCalls,
}: {
  incompleteReason: string | null | undefined;
  hasToolCalls: boolean;
}): LanguageModelV4FinishReason['unified'] {
  switch (incompleteReason) {
    case undefined:
    case null:
      return hasToolCalls ? 'tool-calls' : 'stop';
    case 'max_output_tokens':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    default:
      return hasToolCalls ? 'tool-calls' : 'other';
  }
}
