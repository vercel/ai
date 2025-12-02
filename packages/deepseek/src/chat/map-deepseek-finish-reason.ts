import { LanguageModelV3FinishReason } from '@ai-sdk/provider';

export function mapDeepSeekFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV3FinishReason {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    case 'tool_calls':
      return 'tool-calls';
    case 'insufficient_system_resource':
      return 'error';
    default:
      return 'unknown';
  }
}
