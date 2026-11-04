import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { OpenResponsesLanguageModelOptions } from './responses/open-responses-language-model-options';
/** Options are declared by the adapter; support depends on the configured backend. */
export const openResponsesProviderOptions = {
  language: {
    reasoningEffort: {
      description:
        'Provider-native reasoning effort. The value is passed through to the endpoint and takes precedence over the top-level `reasoning` setting.',
    },
    reasoningSummary: {
      description:
        "Controls reasoning summary output from the model. Valid values: 'concise', 'detailed', 'auto'.",
    },
  } satisfies Record<
    keyof OpenResponsesLanguageModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

/**
 * This protocol accepts arbitrary model IDs. Undeclared backend capabilities
 * remain unknown; a protocol name does not identify a hosted model inventory.
 */
export function getOpenResponsesModelEntry(_modelId: string) {
  return {
    capabilities: {
      language: {
        inputs: { image: 'unknown', audio: 'unknown' },
        objectGeneration: 'unknown',
        tools: { usage: 'unknown', streaming: 'unknown' },
        reasoning: { support: 'unknown' },
        sampling: {
          temperature: 'unknown',
          topP: 'unknown',
          logprobs: 'unknown',
        },
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(openResponsesProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}

/** An arbitrary configured model; this adapter does not own a hosted inventory. */
export const openResponsesModelCatalog = {
  '*': getOpenResponsesModelEntry('*'),
};
