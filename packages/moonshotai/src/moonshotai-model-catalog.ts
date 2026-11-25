import type {
  MoonshotAIChatModelId,
  MoonshotAILanguageModelOptions,
} from './moonshotai-chat-options';
import type {
  ModelCapability,
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

/**
 * How a model's reasoning is controlled. Each value is one request behavior:
 *
 * - `none`: the model does not reason.
 * - `thinking`: the `thinking` field turns reasoning on or off.
 * - `thinking-with-history`: like `thinking`, and reasoning from previous
 *   turns can be preserved.
 * - `thinking-always-on`: the `thinking` field is accepted, but reasoning
 *   cannot be turned off.
 * - `effort`: the model always reasons, and `reasoningEffort` sets how much.
 *   It does not accept the `thinking` field.
 * - `unknown`: nothing is known, so the settings are sent as given and the
 *   API decides.
 */
export type MoonshotAIReasoningControl =
  | 'none'
  | 'thinking'
  | 'thinking-with-history'
  | 'thinking-always-on'
  | 'effort'
  | 'unknown';

/**
 * One row of the language model matrix. Every capability that differs between
 * models is one flat cell, and every listed model fills in every cell. Nothing
 * is derived from the model ID.
 *
 * Facts that depend on each other share one cell, so a row cannot contradict
 * itself: a cell is a single value or one of a fixed set of values.
 */
export type MoonshotAILanguageModelRow = {
  /**
   * `false`: nothing is documented for the model ID. Image and video input
   * are then reported as `'unknown'`.
   */
  documented: boolean;
  image: boolean;
  video: boolean;
  /** Accepts the tool choice `required`. */
  requiredToolChoice: boolean;
  /** Accepts temperature, topP, and the frequency and presence penalties. */
  sampling: boolean;
  reasoning: MoonshotAIReasoningControl;
  /** Loads tools from a system message (dynamic tool loading). */
  dynamicTools: ModelCapability;
};

/**
 * Language model matrix: model IDs by capability. To add a model, add a row
 * and fill in every column.
 */
const languageModelDefinitions = {
  'moonshot-v1-auto': {
    documented: true,
    image: false,
    video: false,
    requiredToolChoice: true,
    sampling: true,
    reasoning: 'none',
    dynamicTools: false,
  },
  'moonshot-v1-8k': {
    documented: true,
    image: false,
    video: false,
    requiredToolChoice: true,
    sampling: true,
    reasoning: 'none',
    dynamicTools: false,
  },
  'moonshot-v1-32k': {
    documented: true,
    image: false,
    video: false,
    requiredToolChoice: true,
    sampling: true,
    reasoning: 'none',
    dynamicTools: false,
  },
  'moonshot-v1-128k': {
    documented: true,
    image: false,
    video: false,
    requiredToolChoice: true,
    sampling: true,
    reasoning: 'none',
    dynamicTools: false,
  },
  'moonshot-v1-8k-vision-preview': {
    documented: true,
    image: true,
    video: false,
    requiredToolChoice: true,
    sampling: true,
    reasoning: 'none',
    dynamicTools: false,
  },
  'moonshot-v1-32k-vision-preview': {
    documented: true,
    image: true,
    video: false,
    requiredToolChoice: true,
    sampling: true,
    reasoning: 'none',
    dynamicTools: false,
  },
  'moonshot-v1-128k-vision-preview': {
    documented: true,
    image: true,
    video: false,
    requiredToolChoice: true,
    sampling: true,
    reasoning: 'none',
    dynamicTools: false,
  },
  'kimi-k2.5': {
    documented: true,
    image: true,
    video: true,
    requiredToolChoice: true,
    sampling: false,
    reasoning: 'thinking',
    dynamicTools: false,
  },
  'kimi-k2.6': {
    documented: true,
    image: true,
    video: true,
    requiredToolChoice: false,
    sampling: false,
    reasoning: 'thinking-with-history',
    dynamicTools: false,
  },
  'kimi-k2.7-code': {
    documented: true,
    image: true,
    video: true,
    requiredToolChoice: false,
    sampling: false,
    reasoning: 'thinking-always-on',
    dynamicTools: false,
  },
  'kimi-k2.7-code-highspeed': {
    documented: true,
    image: true,
    video: true,
    requiredToolChoice: false,
    sampling: false,
    reasoning: 'thinking-always-on',
    dynamicTools: false,
  },
  'kimi-k3': {
    documented: true,
    image: true,
    video: true,
    requiredToolChoice: true,
    sampling: false,
    reasoning: 'effort',
    dynamicTools: true,
  },
  'kimi-k3.1-pro': {
    documented: true,
    image: true,
    video: true,
    requiredToolChoice: true,
    sampling: false,
    reasoning: 'effort',
    dynamicTools: true,
  },
  'kimi-k3.1-pro-highspeed': {
    documented: true,
    image: true,
    video: true,
    requiredToolChoice: true,
    sampling: false,
    reasoning: 'effort',
    dynamicTools: true,
  },
} satisfies Record<string, MoonshotAILanguageModelRow>;

/** Maps a matrix row to its entry. Nothing here inspects the model ID. */
function createLanguageModelEntry(row: MoonshotAILanguageModelRow) {
  const reasons: ModelCapability =
    row.reasoning === 'unknown' ? 'unknown' : row.reasoning !== 'none';
  const entry = {
    capabilities: {
      language: {
        inputs: {
          image: row.documented ? row.image : 'unknown',
          audio: 'unknown',
          video: row.documented ? row.video : 'unknown',
        },
        objectGeneration: true,
        tools: {
          usage: true,
          streaming: true,
          required: row.requiredToolChoice,
        },
        reasoning: {
          support: reasons,
          ...(row.reasoning === 'effort'
            ? { efforts: ['low', 'high', 'max'] }
            : {}),
        },
        sampling: {
          temperature: row.sampling,
          topP: row.sampling,
          logprobs: true,
        },
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
          row.reasoning === 'unknown' ? 'unknown' : row.reasoning === 'effort',
        thinking:
          row.reasoning === 'unknown'
            ? 'unknown'
            : row.reasoning !== 'none' && row.reasoning !== 'effort',
        reasoningHistory: {
          condition:
            'Preserved reasoning is supported by Kimi K2.6, K2.7, and K3.',
        },
        promptCacheOptions: { condition: 'Kimi K3 context caching.' },
      },
    },
    requestConfig: {
      language: {
        reasoning: row.reasoning,
        dynamicTools: row.dynamicTools,
        supportsStructuredOutputs: true,
      },
    },
  } as const;
  return entry satisfies ModelEntry<{
    language: {
      reasoning: MoonshotAIReasoningControl;
      dynamicTools: ModelCapability;
      supportsStructuredOutputs: boolean;
    };
  }>;
}

const listedLanguageModelEntries = Object.fromEntries(
  Object.entries<MoonshotAILanguageModelRow>(languageModelDefinitions).map(
    ([modelId, row]) => [modelId, createLanguageModelEntry(row)],
  ),
);

/**
 * Returns the entry of a listed language model ID from its row. Every other
 * model ID uses the fallback for unlisted IDs.
 */
export function getMoonshotAILanguageModelEntry(
  modelId: MoonshotAIChatModelId,
) {
  return Object.prototype.hasOwnProperty.call(
    listedLanguageModelEntries,
    modelId,
  )
    ? listedLanguageModelEntries[modelId]
    : createLanguageModelEntry(getUnlistedLanguageModelRow(modelId));
}

/** Row for unlisted `moonshot-v1-*` model IDs, which do not reason. */
const unlistedMoonshotV1Model: MoonshotAILanguageModelRow = {
  documented: false,
  image: false,
  video: false,
  requiredToolChoice: true,
  sampling: true,
  reasoning: 'none',
  dynamicTools: false,
};

/** Row for every other unlisted model ID. */
const unknownModel: MoonshotAILanguageModelRow = {
  documented: false,
  image: false,
  video: false,
  requiredToolChoice: true,
  sampling: true,
  reasoning: 'unknown',
  dynamicTools: 'unknown',
};

/**
 * Resolves a model ID that is not listed in the matrix to a row. This is the
 * only place that looks at the model ID.
 */
function getUnlistedLanguageModelRow(
  modelId: string,
): MoonshotAILanguageModelRow {
  return modelId.startsWith('moonshot-v1-')
    ? unlistedMoonshotV1Model
    : unknownModel;
}

export const moonshotaiModelCatalog = Object.fromEntries(
  Object.keys(languageModelDefinitions).map(id => [
    id,
    getMoonshotAILanguageModelEntry(id),
  ]),
);

/** Known model IDs, derived from the matrix used to build the catalog. */
export type MoonshotAIModelIds = {
  language: keyof typeof languageModelDefinitions;
};
