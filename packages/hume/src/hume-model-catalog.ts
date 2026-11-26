import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { HumeSpeechModelOptions } from './hume-speech-model-options';

export const humeProviderOptions = {
  speech: {
    context: {
      description:
        'Context for the speech synthesis request. Can be either a generationId for retrieving a previous generation, or a list of utterances to synthesize.',
    },
  } satisfies Record<keyof HumeSpeechModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

// Hume has no selectable model ID. Preserve the existing empty-string identity.
export const humeSpeechModelIds = [''] as const;
export function getHumeSpeechModelEntry(_modelId: string) {
  const speech = {
    instructions: true,
    speed: true,
    outputFormats: ['mp3', 'pcm', 'wav'],
  } as const;
  return {
    capabilities: { speech },
    providerOptions: { speech: { context: true } },
    requestConfig: { speech: { defaultOutputFormat: 'mp3' } },
  } as const satisfies ModelEntry<{ speech: { defaultOutputFormat: 'mp3' } }>;
}

export const humeModelCatalog = Object.fromEntries(
  humeSpeechModelIds.map(id => [id, getHumeSpeechModelEntry(id)]),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type HumeModelIds = {
  speech: (typeof humeSpeechModelIds)[number];
};
