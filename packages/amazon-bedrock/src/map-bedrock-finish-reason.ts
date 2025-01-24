import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import { StopReason } from './bedrock-api-types';

export function mapBedrockFinishReason(
  finishReason?: StopReason,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'stop_sequence':
    case 'end_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'content_filtered':
    case 'guardrail_intervened':
      return 'content-filter';
    case 'tool_use':
      return 'tool-calls';
    default:
      return 'unknown';
  }
}
