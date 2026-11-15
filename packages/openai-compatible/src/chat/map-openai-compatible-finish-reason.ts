import type { LanguageModelV4FinishReason } from '@ai-sdk/provider';

export function mapOpenAICompatibleFinishReason(
  finishReason: string | null | undefined,
  // flag that checks if the model refused to answer:
  { hasRefusal = false }: { hasRefusal?: boolean } = {},
): LanguageModelV4FinishReason['unified'] {
  switch (finishReason) {
    case 'stop':
      // OpenAI reports a completed response for refusals, so the refusal is
      // the reason the response ended:
      return hasRefusal ? 'content-filter' : 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    case 'function_call':
    case 'tool_calls':
      return 'tool-calls';
    default:
      return 'other';
  }
}
