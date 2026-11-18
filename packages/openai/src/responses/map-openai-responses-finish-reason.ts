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
      // A client-side function call must win over a refusal so that the tools
      // are still executed. The refusal text remains part of the content.
      if (hasFunctionCall) return 'tool-calls';
      return hasRefusal ? 'content-filter' : 'stop';
    case 'max_output_tokens':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    default:
      return hasFunctionCall ? 'tool-calls' : 'other';
  }
}
