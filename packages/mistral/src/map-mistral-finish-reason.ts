import { LanguageModelV3FinishReason } from '@ai-sdk/provider';

export function mapMistralFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV3FinishReason {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
    case 'model_length':
      return 'length';
    case 'tool_calls':
      return 'tool-calls';
    default:
      return 'unknown';
  }
}
