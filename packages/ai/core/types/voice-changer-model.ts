import {
  VoiceChangerModelV1,
  VoiceChangerModelV1CallWarning,
} from '@ai-sdk/provider';

/**
Voice changer model that is used by the AI SDK Core functions.
  */
export type VoiceChangerModel = VoiceChangerModelV1;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
export type VoiceChangerWarning = VoiceChangerModelV1CallWarning;
