// https://ai.google.dev/models/gemini
export type GoogleGenerativeAIModelId =
  | 'gemini-2.0-flash-exp'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-flash-latest'
  | 'gemini-1.5-flash-001'
  | 'gemini-1.5-flash-002'
  | 'gemini-1.5-flash-exp-0827'
  | 'gemini-1.5-flash-8b'
  | 'gemini-1.5-flash-8b-latest'
  | 'gemini-1.5-flash-8b-exp-0924'
  | 'gemini-1.5-flash-8b-exp-0827'
  | 'gemini-1.5-pro-latest'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-pro-001'
  | 'gemini-1.5-pro-002'
  | 'gemini-1.5-pro-exp-0827'
  | 'gemini-1.0-pro'
  | (string & {});

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
      | 'BLOCK_NONE';
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
}

export interface InternalGoogleGenerativeAISettings
  extends GoogleGenerativeAISettings {}
