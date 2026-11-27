import type { ModelEntry } from '@ai-sdk/provider';

// These adapter limits apply to custom IDs as well as catalog models.
export const humeDecisionModelLimits = {
  supportedQuestionTypes: ['choice', 'score', 'boolean'],
  maxQuestions: 20,
  minChoiceOptions: 2,
  maxChoiceOptions: 20,
  minScoreLevels: 2,
  maxScoreLevels: 10,
} as const;

const decisionModelIds = ['audio-decisions'] as const;
export function getHumeDecisionModelEntry(_modelId: string) {
  return {
    capabilities: {
      decision: {
        questionTypes: {
          boolean: true,
          choice: true,
          score: true,
          box: false,
        },
        inputs: { image: false },
        reasoning: false,
        maxOutputTokens: false,
        ...humeDecisionModelLimits,
      },
    },
  } satisfies ModelEntry;
}

export const humeModelCatalog = Object.fromEntries(
  decisionModelIds.map(id => [id, getHumeDecisionModelEntry(id)] as const),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type HumeModelIds = {
  decision: (typeof decisionModelIds)[number];
};
