import type { LanguageModelV3FinishReason } from '@ai-sdk/provider';

<<<<<<< HEAD
export function mapPerplexityFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV3FinishReason['unified'] {
  switch (finishReason) {
    case 'stop':
    case 'length':
      return finishReason;
=======
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
>>>>>>> 38fe0e5997 (feat(provider/perplexity)!: migrate to Agent API (#18991))
    default:
      return hasFunctionCall ? 'tool-calls' : 'other';
  }
}
