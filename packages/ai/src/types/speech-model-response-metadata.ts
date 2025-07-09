export type SpeechModelResponseMetadata = {
  /**
Timestamp for the start of the generated response.
   */
  timestamp: Date;

  /**
The ID of the response model that was used to generate the response.
   */
  modelId: string;

  /**
Response headers.
   */
  headers?: Record<string, string>;
<<<<<<< HEAD:packages/ai/core/types/speech-model-response-metadata.ts
=======

  /**
Response body.
   */
  body?: unknown;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/types/speech-model-response-metadata.ts
};
