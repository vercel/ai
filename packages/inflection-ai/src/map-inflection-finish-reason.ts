import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

export function mapInflectionFinishReason(
  reason: string | null | undefined,
): LanguageModelV1FinishReason {
  if (!reason) {
    return 'unknown';
  }

  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    default:
      return 'unknown';
  }
}
