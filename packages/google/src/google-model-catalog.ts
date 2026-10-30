import {
  defineModelCatalog,
  type LanguageModelCapabilities,
} from '@ai-sdk/provider-utils';

export type GoogleThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * Capabilities of a Gemini or Gemma model, used by the Google Generative AI
 * and Google Vertex AI providers.
 *
 * @see https://ai.google.dev/gemini-api/docs/models
 */
export type GoogleLanguageModelCapabilities = LanguageModelCapabilities & {
  readonly tools: LanguageModelCapabilities['tools'] & {
    /**
     * Supports provider-defined tools such as Google Search and code
     * execution.
     */
    readonly providerTools: boolean;
    readonly fileSearch: boolean;
    /**
     * Supports function tools and provider-defined tools in the same request.
     */
    readonly mixed: boolean;
    readonly googleSearch: boolean;
    readonly urlContext: boolean;
  };

  /**
   * Accepts a system instruction. Otherwise system messages are sent as user
   * content.
   */
  readonly systemInstruction: boolean;

  /**
   * Function responses can contain files.
   */
  readonly functionResponseParts: boolean;

  /**
   * Function calls in the conversation require thought signatures. Missing
   * signatures are replaced with a signature that skips validation.
   */
  readonly thoughtSignatures: boolean;

  /**
   * How a JSON response format is combined with function tools:
   * - `response-format`: sends the response format with the tools, or adds a
   *   JSON response tool when the tool choice forces tool use.
   * - `json-tool`: adds a JSON response tool instead of the response format.
   * - `none`: sends the response format with the tools.
   */
  readonly jsonResponseWithFunctionTools:
    | 'response-format'
    | 'json-tool'
    | 'none';

  /**
   * Accepts `frequencyPenalty` and `presencePenalty` on the Gemini API.
   * Vertex AI accepts them for every model.
   */
  readonly penaltiesOnGeminiApi: boolean;

  readonly reasoning:
    | {
        /** Thinking levels that top-level `reasoning` maps to. */
        readonly efforts: readonly GoogleThinkingLevel[];
      }
    | {
        readonly efforts?: undefined;
        /** Limits of the thinking budget. */
        readonly budget: { readonly min: number; readonly max: number };
      };
};

const gemini1: GoogleLanguageModelCapabilities = {
  inputs: { image: true, audio: true },
  objectGeneration: true,
  tools: {
    usage: true,
    streaming: true,
    providerTools: false,
    fileSearch: false,
    mixed: false,
    googleSearch: true,
    urlContext: true,
  },
  systemInstruction: true,
  functionResponseParts: false,
  thoughtSignatures: false,
  jsonResponseWithFunctionTools: 'json-tool',
  penaltiesOnGeminiApi: true,
  reasoning: { budget: { min: 0, max: 24576 } },
};

const gemini2: GoogleLanguageModelCapabilities = {
  ...gemini1,
  tools: { ...gemini1.tools, providerTools: true },
};

const gemini25: GoogleLanguageModelCapabilities = {
  ...gemini2,
  tools: { ...gemini2.tools, fileSearch: true },
  penaltiesOnGeminiApi: false,
};

const gemini25Pro: GoogleLanguageModelCapabilities = {
  ...gemini25,
  reasoning: { budget: { min: 128, max: 32768 } },
};

const gemini3: GoogleLanguageModelCapabilities = {
  ...gemini2,
  tools: { ...gemini2.tools, fileSearch: true, mixed: true },
  functionResponseParts: true,
  thoughtSignatures: true,
  jsonResponseWithFunctionTools: 'response-format',
  reasoning: { efforts: ['minimal', 'low', 'medium', 'high'] },
};

// Models without the `minimal` thinking level:
const gemini3WithoutMinimalThinking: GoogleLanguageModelCapabilities = {
  ...gemini3,
  reasoning: { efforts: ['low', 'medium', 'high'] },
};

// Gemini 3 Pro Image uses a thinking budget instead of thinking levels.
const gemini3ProImage: GoogleLanguageModelCapabilities = {
  ...gemini3,
  reasoning: { budget: { min: 0, max: 32768 } },
};

// Models that are not Gemini models, e.g. Gemma or tuned models.
const nonGemini: GoogleLanguageModelCapabilities = {
  ...gemini1,
  jsonResponseWithFunctionTools: 'none',
};

/**
 * Lowercases the model ID and removes resource prefixes, e.g.
 * `publishers/google/models/gemini-2.5-flash` to `gemini-2.5-flash`.
 */
function normalizeGoogleModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/^.*\//, '')
    .replace(/^.*\.(?=gemini-)/, '');
}

// Major version 3 or later:
const gemini3OrLater = String.raw`gemini-(?:[3-9]|[1-9]\d+)`;

export const googleLanguageModelCatalog =
  defineModelCatalog<GoogleLanguageModelCapabilities>({
    normalize: normalizeGoogleModelId,
    entries: [
      // Documented models:
      {
        match: 'gemini-nano-banana-2.1',
        capabilities: {
          ...gemini3,
          objectGeneration: false,
          tools: {
            ...gemini3.tools,
            usage: false,
            streaming: false,
            urlContext: false,
          },
        },
      },
      { match: 'gemini-4-argon', capabilities: gemini3 },
      {
        match: ['gemini-3.8-flash', 'gemini-3.7-flash'],
        capabilities: gemini3WithoutMinimalThinking,
      },
      {
        match: [
          'gemini-3.6-flash',
          'gemini-3.5-flash',
          'gemini-3.5-flash-lite',
        ],
        capabilities: gemini3,
      },
      {
        match: 'gemini-3.1-pro-preview',
        capabilities: gemini3WithoutMinimalThinking,
      },
      {
        match: [
          'gemini-3.1-flash-image-preview',
          'gemini-3.1-flash-lite-preview',
        ],
        capabilities: gemini3,
      },
      {
        match: 'gemini-3-pro-preview',
        capabilities: gemini3WithoutMinimalThinking,
      },
      { match: 'gemini-3-pro-image-preview', capabilities: gemini3ProImage },
      { match: 'gemini-3-flash-preview', capabilities: gemini3 },
      { match: 'gemini-2.5-pro', capabilities: gemini25Pro },
      {
        match: [
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-2.5-flash-lite-preview-06-17',
        ],
        capabilities: gemini25,
      },
      { match: 'gemini-2.0-flash', capabilities: gemini2 },

      // Model families, tested in order:
      { match: /^gemini-1(?:[.-]|$)/, capabilities: gemini1 },
      { match: /^gemini-pro(?:-vision)?$/, capabilities: gemini1 },
      { match: /^gemini-robotics-er-1\.5(?:[.-]|$)/, capabilities: gemini1 },
      { match: /^gemini-2\.5-pro/, capabilities: gemini25Pro },
      { match: /^gemini-2\.5(?:[.-]|$)/, capabilities: gemini25 },
      { match: /^gemini-2(?:[.-]|$)/, capabilities: gemini2 },
      { match: /^gemini-3-pro-image/, capabilities: gemini3ProImage },
      {
        match: /^gemini-flash-latest$/,
        capabilities: gemini3WithoutMinimalThinking,
      },
      {
        match: new RegExp(`^${gemini3OrLater}(?:\\.\\d+)?-pro(?:-|$)`),
        capabilities: gemini3WithoutMinimalThinking,
      },
      {
        // Gemini 3.7 Flash and later, except Flash-Lite:
        match:
          /^gemini-(?:3\.(?:[7-9]|[1-9]\d+)|(?:[4-9]|[1-9]\d+)\.\d+)-flash(?:$|-(?!lite(?:-|$)))/,
        capabilities: gemini3WithoutMinimalThinking,
      },
      // Other Gemini models get the behavior of the newest models:
      { match: /^gemini-/, capabilities: gemini3 },
      {
        match: /nano-banana/,
        capabilities: {
          ...nonGemini,
          tools: { ...nonGemini.tools, providerTools: true },
        },
      },
      {
        match: /^gemma-/,
        capabilities: { ...nonGemini, systemInstruction: false },
      },
      { match: /^(?:deep-research-|aqa$)/, capabilities: nonGemini },
    ],
    // Unknown models: provider-defined tools are sent and the API validates
    // them.
    fallback: () => ({
      ...nonGemini,
      tools: { ...nonGemini.tools, providerTools: true, fileSearch: true },
    }),
  });
