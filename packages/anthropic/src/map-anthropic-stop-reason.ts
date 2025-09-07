import { LanguageModelV2FinishReason } from '@ai-sdk/provider';

/**
 * @see https://docs.anthropic.com/en/api/messages#response-stop-reason
 */
export function mapAnthropicStopReason({
  finishReason,
  isJsonResponseFromTool,
}: {
  finishReason: string | null | undefined;
  isJsonResponseFromTool?: boolean;
}): LanguageModelV2FinishReason {
  switch (finishReason) {
    case 'pause_turn':
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'refusal':
      return 'content-filter';
    case 'tool_use':
      return isJsonResponseFromTool ? 'stop' : 'tool-calls';
    case 'max_tokens':
      return 'length';
    default:
      return 'unknown';
  }
}
