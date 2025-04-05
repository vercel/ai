import {
  TranscriptionModelV1,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';

/**
Transcription model that is used by the AI SDK Core functions.
  */
export type TranscriptionModel = TranscriptionModelV1;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
export type TranscriptionWarning = TranscriptionModelV1CallWarning;
