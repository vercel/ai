import { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { BedrockStopReason } from './bedrock-api-types';

export function mapBedrockFinishReason(
  finishReason?: BedrockStopReason,
): LanguageModelV2FinishReason {
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
