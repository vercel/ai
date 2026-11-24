import { getXaiLanguageModelEntry } from './xai-model-catalog';

/** Compatibility projections for existing internal consumers. */
export function supportsReasoningEffort(modelId: string): boolean {
  return (
    getXaiLanguageModelEntry(modelId).capabilities.language.reasoning
      .portableEfforts.length > 0
  );
}

export function supportsNoneReasoningEffort(modelId: string): boolean {
  return getXaiLanguageModelEntry(
    modelId,
  ).capabilities.language.reasoning.portableEfforts.includes('none');
}
