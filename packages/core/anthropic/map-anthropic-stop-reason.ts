import { LanguageModelV1FinishReason } from '../spec';

export function mapAnthropicStopReason({
  stopReason,
  stopSequence,
}: {
  stopReason: string | null | undefined;
  stopSequence?: string | null | undefined;
}): LanguageModelV1FinishReason {
  switch (stopReason) {
    case 'end_turn':
      return 'stop';

    case 'stop_sequence': {
      if (stopSequence === '</function_calls>') {
        return 'tool-calls';
      }

      return 'stop';
    }

    case 'max_tokens':
      return 'length';

    default:
      return 'other';
  }
}
