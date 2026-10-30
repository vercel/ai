import { getXaiLanguageModelEntry } from './xai-model-catalog';

/** Compatibility projections for existing internal consumers. */
export function supportsReasoningEffort(modelId: string): boolean {
  return getXaiLanguageModelEntry(modelId).capabilities.language.reasoning
    .portable.configurable;
}

export function supportsNoneReasoningEffort(modelId: string): boolean {
  return getXaiLanguageModelEntry(modelId).capabilities.language.reasoning
    .portable.none;
}
