import type { MiniMaxModelIds } from './minimax-model-catalog';

// https://platform.minimax.io/docs
export type MiniMaxVideoModelId = MiniMaxModelIds['video'] | (string & {});
