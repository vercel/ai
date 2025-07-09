<<<<<<< HEAD:packages/ai/core/types/speech-model.ts
import { SpeechModelV1, SpeechModelV1CallWarning } from '@ai-sdk/provider';
=======
import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/types/speech-model.ts

/**
Speech model that is used by the AI SDK Core functions.
  */
<<<<<<< HEAD:packages/ai/core/types/speech-model.ts
export type SpeechModel = SpeechModelV1;
=======
export type SpeechModel = SpeechModelV2;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/types/speech-model.ts

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
<<<<<<< HEAD:packages/ai/core/types/speech-model.ts
export type SpeechWarning = SpeechModelV1CallWarning;
=======
export type SpeechWarning = SpeechModelV2CallWarning;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/types/speech-model.ts
