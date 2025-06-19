import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';

/**
Speech model that is used by the AI SDK Core functions.
  */
export type SpeechModel = SpeechModelV2;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
export type SpeechWarning = SpeechModelV2CallWarning;
