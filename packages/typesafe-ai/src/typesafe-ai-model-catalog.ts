import type { TypeSafeAiFilePartProviderOptions } from './typesafe-ai-file-part-options';
import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { TypeSafeAiDecisionModelOptions } from './typesafe-ai-decision-model-options';

export const typeSafeAiProviderOptions = {
  decision: {
    longContext: {
      description:
        'Enable experimental long context mode with 262k tokens per request and per question; slower and less accurate than default mode.',
    },
    reference: {
      description:
        'Image file parts only: asset reference used to place the image in state, instructions, or criteria. Defaults to a generated unique ID.',
    },
    insertReference: {
      description:
        'Image file parts only: whether to insert the asset reference into state. False requires an explicit reference.',
    },
  } satisfies Record<
    | keyof TypeSafeAiDecisionModelOptions
    | keyof TypeSafeAiFilePartProviderOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const typeSafeAiDecisionModelIds = [
  'jev-1.13.0',
  'jev-1.14.0',
  'jev-latest',
  'jev-preview',
] as const;

export const typeSafeAiSupportedQuestionTypes = [
  'choice',
  'score',
  'boolean',
  'box',
] as const;
const modelDescriptions: Record<string, string> = {
  'jev-1.13.0': 'Jev 1.13 release.',
  'jev-1.14.0': 'Jev 1.14 release.',
  'jev-latest': 'Alias for the latest stable release.',
  'jev-preview': 'Alias for the latest release, including previews.',
};
export function getTypeSafeAiDecisionModelEntry(modelId: string) {
  const known = typeSafeAiDecisionModelIds.some(id => id === modelId);
  const decision = {
    questionTypes: { boolean: true, choice: true, score: true, box: true },
    inputs: { image: true },
    reasoning: false,
    maxOutputTokens: false,
    description: modelDescriptions[modelId],
  } as const;
  return {
    capabilities: { decision },
    providerOptions: {
      decision: {
        longContext: known ? true : 'unknown',
        reference: {
          condition:
            'Image file parts only; references must be nonempty and unique within a request.',
        },
        insertReference: {
          condition:
            'Image file parts only; false requires an explicit reference.',
        },
      },
    },
  } as const satisfies ModelEntry;
}

export const typeSafeAiModelCatalog = Object.fromEntries(
  typeSafeAiDecisionModelIds.map(id => [
    id,
    getTypeSafeAiDecisionModelEntry(id),
  ]),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type TypeSafeAiModelIds = {
  decision: (typeof typeSafeAiDecisionModelIds)[number];
};
