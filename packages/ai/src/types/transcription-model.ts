import {
  TranscriptionModelV2,
  TranscriptionModelV3,
  TranscriptionModelV3CallWarning,
} from '@ai-sdk/provider';

/**
Transcription model that is used by the AI SDK Core functions.
  */
export type TranscriptionModel = string | TranscriptionModelV3 | TranscriptionModelV2;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
export type TranscriptionWarning = TranscriptionModelV3CallWarning;
