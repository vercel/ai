import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { ParallelDecisionModelOptions } from './parallel-decision-model-options';

export const parallelProviderOptions = {
  decision: {
    includeExcerpts: {
      description: 'Include evidence excerpts in citations. Defaults to true.',
    },
  } satisfies Record<
    keyof ParallelDecisionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const parallelDecisionModelIds = ['fast'] as const;

export const parallelSupportedQuestionTypes = [
  'boolean',
  'choice',
  'score',
] as const;
export function getParallelDecisionModelEntry(modelId: string) {
  const known = parallelDecisionModelIds.some(id => id === modelId);
  return {
    capabilities: {
      decision: {
        questionTypes: { boolean: true, choice: true, score: true, box: false },
        inputs: { image: false },
        reasoning: false,
        maxOutputTokens: false,
      },
    },
    providerOptions: {
      decision: { includeExcerpts: known ? true : 'unknown' },
    },
  } as const satisfies ModelEntry;
}

export const parallelModelCatalog = Object.fromEntries(
  parallelDecisionModelIds.map(id => [id, getParallelDecisionModelEntry(id)]),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type ParallelModelIds = {
  decision: (typeof parallelDecisionModelIds)[number];
};
