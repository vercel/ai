import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

export function mapGoogleGenerativeAIFinishReason({
  finishReason,
  hasToolCalls,
}: {
  finishReason: string | null | undefined;
  hasToolCalls: boolean;
}): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'STOP':
      return hasToolCalls ? 'tool-calls' : 'stop';
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
