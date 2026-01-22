import { LanguageModelV3FinishReason } from '@ai-sdk/provider';
import { BedrockStopReason } from './bedrock-api-types';

export function mapBedrockFinishReason(
  finishReason: BedrockStopReason,
  isJsonResponseFromTool?: boolean,
): LanguageModelV3FinishReason['unified'] {
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
      return isJsonResponseFromTool ? 'stop' : 'tool-calls';
    default:
      return 'other';
  }
}
