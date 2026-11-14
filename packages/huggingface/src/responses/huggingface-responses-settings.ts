import type { HuggingFaceModelIds } from '../huggingface-model-catalog';

export type HuggingFaceResponsesModelId =
  | HuggingFaceModelIds['language']
  | (string & {});

export interface HuggingFaceResponsesSettings {
  metadata?: Record<string, string>;
  instructions?: string;
  strictJsonSchema?: boolean;
}
