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
    case 'ERROR_LIMIT':
      return 'error';

    case 'ERROR_TOXIC':
      return 'content-filter';

    case 'USER_CANCEL':
      return 'other';

    default:
      return 'unknown';
  }
}
