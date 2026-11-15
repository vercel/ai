import type { LanguageModelV4FinishReason } from '@ai-sdk/provider';

export function mapPerplexityFinishReason({
  status,
  incompleteReason,
  hasFunctionCall,
}: {
  status: string | null | undefined;
  incompleteReason: string | null | undefined;
  hasFunctionCall: boolean;
}): LanguageModelV4FinishReason['unified'] {
  switch (incompleteReason) {
    case 'max_output_tokens':
      return 'length';
    case 'content_filter':
      return 'content-filter';
  }

  switch (status) {
    case 'completed':
      return hasFunctionCall ? 'tool-calls' : 'stop';
    case 'requires_action':
      return 'tool-calls';
    case 'failed':
      return 'error';
    case 'cancelled':
    case 'queued':
    case 'in_progress':
    default:
      return hasFunctionCall ? 'tool-calls' : 'other';
  }
}
