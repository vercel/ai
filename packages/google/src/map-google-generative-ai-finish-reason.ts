import { LanguageModelV2FinishReason } from '@ai-sdk/provider';

export function mapGoogleGenerativeAIFinishReason({
  finishReason,
  hasToolCalls,
}: {
  finishReason: string | null | undefined;
  hasToolCalls: boolean;
}): LanguageModelV2FinishReason {
  switch (finishReason) {
    case 'STOP':
      return hasToolCalls ? 'tool-calls' : 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'IMAGE_SAFETY':
    case 'RECITATION':
    case 'SAFETY':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
      return 'content-filter';
    case 'FINISH_REASON_UNSPECIFIED':
    case 'OTHER':
      return 'other';
    case 'MALFORMED_FUNCTION_CALL':
      return 'error';
    default:
      return 'unknown';
  }
}
