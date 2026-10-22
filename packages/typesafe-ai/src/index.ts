import type { TypeSafeAiDecisionModelId } from './typesafe-ai-decision-model';

export { createTypeSafeAi, typeSafeAi } from './typesafe-ai-provider';
export type {
  TypeSafeAiProvider,
  TypeSafeAiProviderSettings,
} from './typesafe-ai-provider';
export type { TypeSafeAiDecisionModelId as Experimental_TypeSafeAiDecisionModelId } from './typesafe-ai-decision-model';
export { VERSION } from './version';
export type { TypeSafeAiFilePartProviderOptions } from './typesafe-ai-file-part-options';
export type { TypeSafeAiDecisionModelOptions } from './typesafe-ai-decision-model-options';

/** @deprecated Use `Experimental_TypeSafeAiDecisionModelId` instead. */
export type Experimental_TypeSafeAiEvaluationModelId =
  TypeSafeAiDecisionModelId;
