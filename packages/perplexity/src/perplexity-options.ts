import type { PerplexityModelIds } from './perplexity-model-catalog';

export type PerplexityAgentPreset = PerplexityModelIds['language'];

export type PerplexityLanguageModelId =
  | PerplexityModelIds['language']
  | (string & {});
