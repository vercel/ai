import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

export function mapCohereFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'COMPLETE':
    case 'STOP_SEQUENCE':
      return 'stop';

    case 'MAX_TOKENS':
      return 'length';

    case 'ERROR':
      return 'error';

    case 'TOOL_CALL':
      return 'tool-calls';

    default:
      return 'unknown';
  }
}
