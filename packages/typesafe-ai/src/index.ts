import type { TypeSafeAiDecisionModelId } from './typesafe-ai-decision-model';

export { createTypeSafeAi, typeSafeAi } from './typesafe-ai-provider';
export type {
  TypeSafeAiProvider,
  TypeSafeAiProviderSettings,
} from './typesafe-ai-provider';
export type { TypeSafeAiDecisionModelId as Experimental_TypeSafeAiDecisionModelId } from './typesafe-ai-decision-model';
export { VERSION } from './version';

/** @deprecated Use `Experimental_TypeSafeAiDecisionModelId` instead. */
export type Experimental_TypeSafeAiEvaluationModelId =
  TypeSafeAiDecisionModelId;
