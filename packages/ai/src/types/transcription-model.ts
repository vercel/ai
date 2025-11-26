import { TranscriptionModelV2, TranscriptionModelV3 } from '@ai-sdk/provider';

/**
Transcription model that is used by the AI SDK Core functions.
  */
export type TranscriptionModel =
  | string
  | TranscriptionModelV3
  | TranscriptionModelV2;
