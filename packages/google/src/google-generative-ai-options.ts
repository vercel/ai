import { z } from 'zod';

export type GoogleGenerativeAIModelId =
  // Stable models
  // https://ai.google.dev/gemini-api/docs/models/gemini
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
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-001'
  | 'gemini-2.0-flash-live-001'
  | 'gemini-2.0-flash-lite'
  | 'gemini-2.0-pro-exp-02-05'
  | 'gemini-2.0-flash-thinking-exp-01-21'
  | 'gemini-2.0-flash-exp'
  // Experimental models
  // https://ai.google.dev/gemini-api/docs/models/experimental-models
  | 'gemini-2.5-pro-exp-03-25'
  | 'gemini-2.5-flash-preview-04-17'
  | 'gemini-exp-1206'
  | 'gemma-3-27b-it'
  | 'learnlm-1.5-pro-experimental'
  | (string & {});

const dynamicRetrievalConfig = z.object({
  /**
   * The mode of the predictor to be used in dynamic retrieval.
   */
  mode: z.enum(['MODE_UNSPECIFIED', 'MODE_DYNAMIC']).optional(),

  /**
   * The threshold to be used in dynamic retrieval. If not set, a system default
   * value is used.
   */
  dynamicThreshold: z.number().optional(),
});

export type DynamicRetrievalConfig = z.infer<typeof dynamicRetrievalConfig>;

export const googleGenerativeAIProviderOptions = z.object({
  responseModalities: z.array(z.enum(['TEXT', 'IMAGE'])).optional(),

  thinkingConfig: z
    .object({
      thinkingBudget: z.number().optional(),
      includeThoughts: z.boolean().optional(),
    })
    .optional(),

  /**
Optional.
The name of the cached content used as context to serve the prediction.
Format: cachedContents/{cachedContent}
   */
  cachedContent: z.string().optional(),

  /**
   * Optional. Enable structured output. Default is true.
   *
   * This is useful when the JSON Schema contains elements that are
   * not supported by the OpenAPI schema version that
   * Google Generative AI uses. You can use this to disable
   * structured outputs if you need to.
   */
  structuredOutputs: z.boolean().optional(),

  /**
Optional. A list of unique safety settings for blocking unsafe content.
 */
  safetySettings: z
    .array(
      z.object({
        category: z.enum([
          'HARM_CATEGORY_UNSPECIFIED',
          'HARM_CATEGORY_HATE_SPEECH',
          'HARM_CATEGORY_DANGEROUS_CONTENT',
          'HARM_CATEGORY_HARASSMENT',
          'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          'HARM_CATEGORY_CIVIC_INTEGRITY',
        ]),
        threshold: z.enum([
          'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
          'BLOCK_LOW_AND_ABOVE',
          'BLOCK_MEDIUM_AND_ABOVE',
          'BLOCK_ONLY_HIGH',
          'BLOCK_NONE',
          'OFF',
        ]),
      }),
    )
    .optional(),

  threshold: z
    .enum([
      'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      'BLOCK_LOW_AND_ABOVE',
      'BLOCK_MEDIUM_AND_ABOVE',
      'BLOCK_ONLY_HIGH',
      'BLOCK_NONE',
      'OFF',
    ])
    .optional(),

  /**
   * Optional. Enables timestamp understanding for audio-only files.
   *
   * https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding
   */
  audioTimestamp: z.boolean().optional(),

  /**
Optional. When enabled, the model will use Google search to ground the response.

@see https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/overview
 */
  useSearchGrounding: z.boolean().optional(),

  /**
Optional. Specifies the dynamic retrieval configuration.

@note Dynamic retrieval is only compatible with Gemini 1.5 Flash.

@see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/ground-with-google-search#dynamic-retrieval
 */
  dynamicRetrievalConfig: dynamicRetrievalConfig.optional(),
});

export type GoogleGenerativeAIProviderOptions = z.infer<
  typeof googleGenerativeAIProviderOptions
>;
