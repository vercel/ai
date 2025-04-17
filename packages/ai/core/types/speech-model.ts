import { SpeechModelV1, SpeechModelV1CallWarning } from '@ai-sdk/provider';

/**
Speech model that is used by the AI SDK Core functions.
  */
export type SpeechModel = SpeechModelV1;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
export type SpeechWarning = SpeechModelV1CallWarning;
