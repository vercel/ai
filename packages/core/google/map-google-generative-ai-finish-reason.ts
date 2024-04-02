import { LanguageModelV1FinishReason } from '../spec';

export function mapGoogleGenerativeAIFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'RECITATION':
    case 'SAFETY':
      return 'content-filter';
    case 'FINISH_REASON_UNSPECIFIED':
    case 'OTHER':
    default:
      return 'other';
  }
}
