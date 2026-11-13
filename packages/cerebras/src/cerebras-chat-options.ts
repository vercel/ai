import type { CerebrasModelIds } from './cerebras-model-catalog';

// https://inference-docs.cerebras.ai/models/overview
export type CerebrasChatModelId = CerebrasModelIds['language'] | (string & {});
