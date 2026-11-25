export type QuiverAILanguageModelOptions = {
  /**
   * Controls the amount of reasoning used by the model.
   */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';

  /**
   * Requests the model's safe reasoning summary.
   */
  reasoningSummary?: 'auto';
};
