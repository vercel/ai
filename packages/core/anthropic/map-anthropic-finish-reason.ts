import { LanguageModelV1FinishReason } from '../spec';

export function mapAnthropicFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    default:
      return 'other';
  }
}
