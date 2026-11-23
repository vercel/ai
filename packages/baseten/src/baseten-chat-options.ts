import type { BasetenModelIds } from './baseten-model-catalog';

// https://docs.baseten.co/development/model-apis/overview#supported-models
// Below is the current list of models supported by Baseten model APIs.
// Ohter dedicated models are also supported, but not listed here.
export type BasetenChatModelId = BasetenModelIds['language'] | (string & {});
