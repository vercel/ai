export type PerplexityAgentPreset =
  | 'fast'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export type PerplexityLanguageModelId =
  | PerplexityAgentPreset
  | 'perplexity/sonar'
  | 'sonar-deep-research'
  | 'sonar-reasoning-pro'
  | 'sonar-reasoning'
  | 'sonar-pro'
  | 'sonar'
  | (string & {});
