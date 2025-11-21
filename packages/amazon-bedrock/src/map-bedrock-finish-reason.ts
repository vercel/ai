import { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { BedrockStopReason } from './bedrock-api-types';

export function mapBedrockFinishReason(
<<<<<<< HEAD
  finishReason?: BedrockStopReason,
): LanguageModelV2FinishReason {
=======
  finishReason: BedrockStopReason,
  isJsonResponseFromTool?: boolean,
): LanguageModelV3FinishReason {
>>>>>>> 88b2c7eaf (feat(amazon-bedrock,google-vertex-anthropic): Anthropic Structured Tool Call Ports (#9880))
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
      return 'unknown';
  }
}
