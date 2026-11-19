import type { LanguageModelV4FinishReason } from '@ai-sdk/provider';

export function mapDeepSeekResponsesFinishReason({
  status,
  incompleteReason,
  hasFunctionCall,
}: {
  status: string | null | undefined;
  incompleteReason: string | null | undefined;
  hasFunctionCall: boolean;
}): LanguageModelV4FinishReason['unified'] {
  switch (status) {
    case 'completed':
      return hasFunctionCall ? 'tool-calls' : 'stop';
    case 'incomplete':
      return incompleteReason === 'max_output_tokens'
        ? 'length'
        : incompleteReason === 'content_filter'
          ? 'content-filter'
          : 'other';
    case 'failed':
      return 'error';
    default:
      return 'other';
  }
}
