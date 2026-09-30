export type PerplexityAgentPreset =
  | 'fast'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export type PerplexityLanguageModelId =
  | PerplexityAgentPreset
  | 'perplexity/sonar'
  | (string & {});
