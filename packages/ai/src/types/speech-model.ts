import type { GatewaySpeechModelId } from '@ai-sdk/gateway';
import type {
  SpeechModelV2,
  SpeechModelV3,
  SpeechModelV4,
} from '@ai-sdk/provider';

/**
 * Speech model that is used by the AI SDK.
 */
export type SpeechModel =
  | GatewaySpeechModelId
  | SpeechModelV4
  | SpeechModelV3
  | SpeechModelV2;
