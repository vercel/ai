import type { LanguageModelV4FinishReason } from '@ai-sdk/provider';

export function mapOpenAIResponseFinishReason({
  finishReason,
  hasFunctionCall,
  hasRefusal = false,
}: {
  finishReason: string | null | undefined;
  // flag that checks if there have been client-side tool calls (not executed by openai)
  hasFunctionCall: boolean;
  // flag that checks if the model refused to answer:
  hasRefusal?: boolean;
}): LanguageModelV4FinishReason['unified'] {
  switch (finishReason) {
    case undefined:
    case null:
      if (hasRefusal) return 'content-filter';
      return hasFunctionCall ? 'tool-calls' : 'stop';
    case 'max_output_tokens':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    default:
      return hasFunctionCall ? 'tool-calls' : 'other';
  }
}
