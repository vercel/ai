import {
<<<<<<< HEAD:packages/ai/core/types/transcription-model.ts
  TranscriptionModelV1,
  TranscriptionModelV1CallWarning,
=======
  TranscriptionModelV2,
  TranscriptionModelV2CallWarning,
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/types/transcription-model.ts
} from '@ai-sdk/provider';

/**
Transcription model that is used by the AI SDK Core functions.
  */
<<<<<<< HEAD:packages/ai/core/types/transcription-model.ts
export type TranscriptionModel = TranscriptionModelV1;
=======
export type TranscriptionModel = TranscriptionModelV2;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/types/transcription-model.ts

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
<<<<<<< HEAD:packages/ai/core/types/transcription-model.ts
export type TranscriptionWarning = TranscriptionModelV1CallWarning;
=======
export type TranscriptionWarning = TranscriptionModelV2CallWarning;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/types/transcription-model.ts
