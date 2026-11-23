import type { ModelEntry } from '@ai-sdk/provider';

// These adapter limits apply to custom IDs as well as catalog models.
export const liquidDecisionModelLimits = {
  supportedQuestionTypes: ['choice', 'score', 'boolean', 'box'],
  maxQuestions: 128,
  minChoiceOptions: 2,
  maxChoiceOptions: 255,
  minScoreLevels: 2,
  maxScoreLevels: 10,
  maxImages: 8,
  maxAudioClips: 8,
} as const;

const decisionModelIds = ['d1.2', 'd1.2-ultra'] as const;
export function getLiquidDecisionModelEntry(_modelId: string) {
  return {
    capabilities: {
      decision: {
        questionTypes: { boolean: true, choice: true, score: true, box: true },
        inputs: { image: true },
        reasoning: false,
        maxOutputTokens: false,
        ...liquidDecisionModelLimits,
      },
    },
  } satisfies ModelEntry;
}

export const liquidModelCatalog = Object.fromEntries(
  decisionModelIds.map(id => [id, getLiquidDecisionModelEntry(id)] as const),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type LiquidModelIds = {
  decision: (typeof decisionModelIds)[number];
};
