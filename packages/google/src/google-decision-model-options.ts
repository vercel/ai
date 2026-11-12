export type GoogleDecisionModelId = 'gemini-decision-1' | (string & {});

/** Google decision models do not support provider-specific options. */
export type GoogleDecisionModelOptions = Record<string, never>;
