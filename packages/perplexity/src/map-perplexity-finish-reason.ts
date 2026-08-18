import type { LanguageModelV4FinishReason } from '@ai-sdk/provider';

export function mapPerplexityFinishReason({
  status,
  hasFunctionCall,
}: {
  status: string | null | undefined;
  hasFunctionCall: boolean;
}): LanguageModelV4FinishReason['unified'] {
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
