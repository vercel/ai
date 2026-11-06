import type {
  ModelCapabilities,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { ZaiLanguageModelChatOptions } from './zai-chat-language-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const zaiProviderOptions = {
  language: {
    doSample: {
      description:
        'Enables or disables sampling. When disabled, temperature and topP do not take effect.',
    },
    thinking: {
      description:
        'Controls model thinking and whether reasoning from earlier turns is kept.',
    },
    reasoningEffort: {
      description: 'Controls reasoning effort for GLM-5.2 and later models.',
    },
    toolStream: {
      description:
        'Enables incremental function-call argument streaming on supported models.',
    },
    requestId: {
      description:
        'A caller-provided request identifier between 6 and 64 characters.',
    },
    userId: {
      description:
        'A non-sensitive end-user identifier between 6 and 128 characters.',
    },
  } satisfies Record<
    keyof ZaiLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'glm-5.3',
  'glm-5.2',
  'glm-5.1',
  'glm-5-turbo',
  'glm-5',
  'glm-4.7',
  'glm-4.7-flash',
  'glm-4.7-flashx',
  'glm-4.6',
  'glm-4.5',
  'glm-4.5-air',
  'glm-4.5-x',
  'glm-4.5-airx',
  'glm-4.5-flash',
  'glm-4-32b-0414-128k',
  'glm-5.3-flash',
  'glm-5v-turbo',
  'glm-4.6v',
  'glm-4.6v-flash',
  'glm-4.6v-flashx',
  'glm-4.5v',
  'autoglm-phone-multilingual',
] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {};
const unknownLanguageCapabilities: NonNullable<ModelCapabilities['language']> =
  {
    inputs: { image: 'unknown', audio: 'unknown' },
    objectGeneration: 'unknown',
    tools: { usage: 'unknown', streaming: 'unknown' },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
export function getZaiLanguageModelEntry(modelId: string) {
  return {
    capabilities: {
      language:
        documentedLanguageCapabilities[modelId] ?? unknownLanguageCapabilities,
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(zaiProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const zaiModelCatalog = Object.fromEntries(
  languageModelIds.map(id => [id, getZaiLanguageModelEntry(id)]),
);
