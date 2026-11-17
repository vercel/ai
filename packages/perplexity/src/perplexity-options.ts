import type { PerplexityModelIds } from './perplexity-model-catalog';

export type PerplexityAgentPreset = PerplexityModelIds['preset'];

export type PerplexityLanguageModelId =
  | PerplexityModelIds['language']
  | (string & {});
