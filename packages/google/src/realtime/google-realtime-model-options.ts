export type GoogleRealtimeModelId = string;

export type GoogleRealtimeModelOptions = {
  /**
   * Gemini Live Translation configuration.
   *
   * Required for `gemini-3.5-live-translate-preview` when translating speech
   * to a target language.
   */
  translationConfig?: {
    /**
     * BCP-47 language code of the language to translate into.
     * Defaults to `en` in the Gemini API.
     */
    targetLanguageCode?: string;

    /**
     * Whether input audio already in the target language should be echoed
     * instead of producing silence.
     */
    echoTargetLanguage?: boolean;
  };

  /**
   * Gemini Live thinking configuration.
   *
   * Supported by Live models with background reasoning (e.g.
   * `gemini-3.8-live-extended-thinking`), which can process multi-step
   * reasoning and function calls while streaming audio responses. Not
   * supported by latency-optimized models (e.g. `gemini-3.8-live`).
   */
  thinkingConfig?: {
    /**
     * Thinking effort level. Background-reasoning Live models require exactly
     * one of `thinkingLevel` or `thinkingBudget`; when neither is set, the
     * provider sends `thinkingLevel: 'low'` on those models.
     */
    thinkingLevel?: 'low' | 'medium' | 'high';

    /**
     * Token budget for background thinking. Mutually exclusive with
     * `thinkingLevel`; setting it suppresses the default level.
     */
    thinkingBudget?: number;

    /**
     * Whether thought summaries should be included in the response.
     */
    includeThoughts?: boolean;
  };

  /**
   * Default `behavior` stamped onto every function declaration in the
   * session setup.
   *
   * Gemini 3.8 Live models default to `NON_BLOCKING` (asynchronous) function
   * calling. Set to `BLOCKING` for synchronous calls on models that support it
   * (e.g. `gemini-3.8-live`); background-reasoning models accept only
   * `NON_BLOCKING`.
   */
  defaultToolBehavior?: 'BLOCKING' | 'NON_BLOCKING';
};
