export type ElevenLabsRealtimeModelId = string;

export type ElevenLabsRealtimeModelOptions = {
  /**
   * Overrides applied when the conversation starts.
   *
   * This maps to ElevenLabs' `conversation_config_override` payload.
   */
  conversationConfigOverride?: Record<string, unknown>;

  /**
   * Extra body fields forwarded to the configured LLM.
   *
   * This maps to ElevenLabs' `custom_llm_extra_body` payload.
   */
  customLlmExtraBody?: Record<string, unknown>;

  /**
   * Dynamic variables made available to the configured agent.
   *
   * This maps to ElevenLabs' `dynamic_variables` payload.
   */
  dynamicVariables?: Record<string, unknown>;
};
