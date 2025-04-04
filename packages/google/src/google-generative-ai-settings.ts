export type GoogleGenerativeAIModelId =
  // Stable models
  // https://ai.google.dev/gemini-api/docs/models/gemini
  | 'gemini-2.0-flash-001'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-flash-latest'
  | 'gemini-1.5-flash-001'
  | 'gemini-1.5-flash-002'
  | 'gemini-1.5-flash-8b'
  | 'gemini-1.5-flash-8b-latest'
  | 'gemini-1.5-flash-8b-001'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-pro-latest'
  | 'gemini-1.5-pro-001'
  | 'gemini-1.5-pro-002'
  // Experimental models
  // https://ai.google.dev/gemini-api/docs/models/experimental-models
  | 'gemini-2.5-pro-exp-03-25'
  | 'gemini-2.0-flash-lite-preview-02-05'
  | 'gemini-2.0-pro-exp-02-05'
  | 'gemini-2.0-flash-thinking-exp-01-21'
  | 'gemini-2.0-flash-exp'
  | 'gemini-exp-1206'
  | 'gemma-3-27b-it'
  | 'learnlm-1.5-pro-experimental'
  | (string & {});

export interface DynamicRetrievalConfig {
  /**
   * The mode of the predictor to be used in dynamic retrieval.
   */
  mode?: 'MODE_UNSPECIFIED' | 'MODE_DYNAMIC';
  /**
   * The threshold to be used in dynamic retrieval. If not set, a system default
   * value is used.
   */
  dynamicThreshold?: number;
}

export interface GoogleGenerativeAISettings {
  /**
Optional.
The name of the cached content used as context to serve the prediction.
Format: cachedContents/{cachedContent}
   */
  cachedContent?: string;

  /**
   * Optional. Enable structured output. Default is true.
   *
   * This is useful when the JSON Schema contains elements that are
   * not supported by the OpenAPI schema version that
   * Google Generative AI uses. You can use this to disable
   * structured outputs if you need to.
   */
  structuredOutputs?: boolean;

  /**
Optional. A list of unique safety settings for blocking unsafe content.
   */
  safetySettings?: Array<{
    category:
      | 'HARM_CATEGORY_UNSPECIFIED'
      | 'HARM_CATEGORY_HATE_SPEECH'
      | 'HARM_CATEGORY_DANGEROUS_CONTENT'
      | 'HARM_CATEGORY_HARASSMENT'
      | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
      | 'HARM_CATEGORY_CIVIC_INTEGRITY';

    threshold:
      | 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
      | 'BLOCK_LOW_AND_ABOVE'
      | 'BLOCK_MEDIUM_AND_ABOVE'
      | 'BLOCK_ONLY_HIGH'
      | 'BLOCK_NONE'
      | 'OFF';
  }>;
  /**
   * Optional. Enables timestamp understanding for audio-only files.
   *
   * https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding
   */
  audioTimestamp?: boolean;

  /**
Optional. When enabled, the model will use Google search to ground the response.

@see https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/overview
   */
  useSearchGrounding?: boolean;

  /**
Optional. Specifies the dynamic retrieval configuration.

@note Dynamic retrieval is only compatible with Gemini 1.5 Flash.

@see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/ground-with-google-search#dynamic-retrieval
   */
  dynamicRetrievalConfig?: DynamicRetrievalConfig;
}

export interface InternalGoogleGenerativeAISettings
  extends GoogleGenerativeAISettings {}
