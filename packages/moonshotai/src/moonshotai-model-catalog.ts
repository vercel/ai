import type {
  MoonshotAIChatModelId,
  MoonshotAIModelFamily,
  MoonshotAILanguageModelOptions,
} from './moonshotai-chat-options';
import type {
  ModelCapabilities,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const moonshotAIProviderOptions = {
  language: {
    strictJsonSchema: {
      description:
        'Whether to use strict JSON schema validation for structured outputs.',
    },
    logprobs: {
      description: 'Whether to return log probabilities for generated tokens.',
    },
    topLogprobs: {
      description:
        'Number of most likely tokens to return at each token position. Setting this option automatically enables `logprobs`.',
    },
    reasoningEffort: { description: 'Reasoning effort for Kimi K3.' },
    prediction: {
      description:
        'Static predicted content that can accelerate responses when much of the output is known ahead of time.',
    },
    thinking: {
      description:
        'Controls thinking on Kimi K2.5 and K2.6. K2.7 is always enabled.',
    },
    reasoningHistory: {
      description:
        "Controls preserved reasoning behavior in multi-turn conversations. `disabled` and `interleaved` are compatibility values that leave the request unchanged. `preserved` maps to `thinking.keep: 'all'` for Kimi K2.6. Kimi K2.7 and K3 preserve reasoning by default.",
    },
    promptCacheKey: {
      description:
        'Used to cache responses for similar requests to optimize cache hit rates. Typically a session or task id.',
    },
    promptCacheOptions: {
      description:
        'Context caching options for Kimi K3 models. `ttl` selects the cache write tier (`5m` or `1h`). Moonshot uses `5m` when omitted.',
    },
    safetyIdentifier: {
      description:
        'A stable identifier used to help Moonshot detect users violating usage policies. Recommended to hash the username or email address.',
    },
  } satisfies Record<
    keyof MoonshotAILanguageModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'moonshot-v1-auto',
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
  'moonshot-v1-8k-vision-preview',
  'moonshot-v1-32k-vision-preview',
  'moonshot-v1-128k-vision-preview',
  'kimi-k2.5',
  'kimi-k2.6',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
  'kimi-k3',
  'kimi-k3.1-pro',
  'kimi-k3.1-pro-highspeed',
] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {
  'moonshot-v1-auto': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'moonshot-v1-8k': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'moonshot-v1-32k': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'moonshot-v1-128k': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'moonshot-v1-8k-vision-preview': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'moonshot-v1-32k-vision-preview': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'moonshot-v1-128k-vision-preview': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'kimi-k2.5': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'kimi-k2.6': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'kimi-k2.7-code': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'kimi-k2.7-code-highspeed': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'kimi-k3': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'kimi-k3.1-pro': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'kimi-k3.1-pro-highspeed': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
};
const unknownLanguageCapabilities: NonNullable<ModelCapabilities['language']> =
  {
    inputs: { image: 'unknown', audio: 'unknown' },
    objectGeneration: 'unknown',
    tools: { usage: 'unknown', streaming: 'unknown' },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
function resolveModelFamily(
  modelId: MoonshotAIChatModelId,
): MoonshotAIModelFamily {
  if (modelId === 'kimi-k2.5') return 'kimi-k2.5';
  if (modelId === 'kimi-k2.6') return 'kimi-k2.6';
  if (modelId === 'kimi-k2.7-code' || modelId === 'kimi-k2.7-code-highspeed') {
    return 'kimi-k2.7';
  }
  if (
    modelId === 'kimi-k3' ||
    modelId === 'kimi-k3.1-pro' ||
    modelId === 'kimi-k3.1-pro-highspeed'
  ) {
    return 'kimi-k3';
  }
  if (modelId.startsWith('moonshot-v1-')) return 'moonshot-v1';
  return 'unknown';
}

export function getMoonshotAILanguageModelEntry(
  modelId: MoonshotAIChatModelId,
) {
  const family = resolveModelFamily(modelId);
  const kimi = family.startsWith('kimi-');
  const requiredTools =
    modelId !== 'kimi-k2.6' &&
    modelId !== 'kimi-k2.7-code' &&
    modelId !== 'kimi-k2.7-code-highspeed';
  const entry = {
    capabilities: {
      language: {
        ...(documentedLanguageCapabilities[modelId] ??
          unknownLanguageCapabilities),
        objectGeneration: true,
        tools: { usage: true, streaming: true, required: requiredTools },
        reasoning: {
          support: family === 'unknown' ? 'unknown' : kimi,
          ...(family === 'kimi-k3' ? { efforts: ['low', 'high', 'max'] } : {}),
        },
        sampling: { temperature: !kimi, topP: !kimi, logprobs: true },
      },
    },
    providerOptions: {
      language: {
        ...Object.fromEntries(
          Object.keys(moonshotAIProviderOptions.language).map(key => [
            key,
            true,
          ]),
        ),
        reasoningEffort:
          family === 'unknown' ? 'unknown' : family === 'kimi-k3',
        thinking:
          family === 'unknown' ? 'unknown' : kimi && family !== 'kimi-k3',
        reasoningHistory: {
          condition:
            'Preserved reasoning is supported by Kimi K2.6, K2.7, and K3.',
        },
        promptCacheOptions: { condition: 'Kimi K3 context caching.' },
      },
    },
    requestConfig: { language: { family, supportsStructuredOutputs: true } },
  } as const;
  return entry satisfies ModelEntry<{
    language: {
      family: MoonshotAIModelFamily;
      supportsStructuredOutputs: boolean;
    };
  }>;
}
export const moonshotaiModelCatalog = Object.fromEntries(
  languageModelIds.map(id => [id, getMoonshotAILanguageModelEntry(id)]),
);
