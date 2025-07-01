import { LanguageModelV2FinishReason } from '@ai-sdk/provider';

export function mapAdaptiveFinishReason(
  reason?: string,
): LanguageModelV2FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    case 'tool_calls':
      return 'tool-calls';
    default:
      return 'unknown';
  }
}
