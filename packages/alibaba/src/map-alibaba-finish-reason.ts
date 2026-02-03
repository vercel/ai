import { LanguageModelV3FinishReason } from '@ai-sdk/provider';

export function mapAlibabaFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV3FinishReason['unified'] {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'tool-calls';
    default:
      return 'other';
  }
}
