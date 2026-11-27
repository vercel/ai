import type { OpenAICompatibleLanguageModelChatOptions } from '@ai-sdk/openai-compatible';
import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';

/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const subquadraticProviderOptions = {
  language: {
    user: {
      description:
        'A unique identifier representing your end-user, which can help providers to\nmonitor and detect abuse.',
    },
    reasoningEffort: {
      description:
        'Reasoning effort sent as `reasoning_effort`, unchanged. SubQ accepts `low`, `high`, and `max`; `minimal`, `medium`, and `xhigh` run as `low`, `high`, and `max`. Reasoning cannot be disabled.',
    },
    textVerbosity: {
      description:
        'Controls the verbosity of the generated text. Defaults to `medium`.',
    },
    strictJsonSchema: {
      description:
        'Whether to use strict JSON schema validation.\nWhen true, the model uses constrained decoding to guarantee schema compliance.\nOnly used when a schema is provided.',
    },
  } satisfies Record<
    keyof OpenAICompatibleLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

// SubQ runs `minimal`, `medium`, and `xhigh` as `low`, `high`, and `max`, and
// rejects `none` because reasoning cannot be disabled.
const reasoningEffortMap = {
  minimal: 'low',
  low: 'low',
  medium: 'high',
  high: 'high',
  xhigh: 'max',
  max: 'max',
} as const;

export const subquadraticRequestDefaults = {
  language: { supportsStructuredOutputs: true, reasoningEffortMap },
} as const;

const languageModelIds = ['subq-savant-1.4', 'subq-savant-latest'] as const;

export function getSubquadraticLanguageModelEntry(_modelId: string) {
  const entry = {
    capabilities: {
      language: {
        inputs: { image: true, audio: false },
        objectGeneration: true,
        tools: { usage: true, streaming: true },
        reasoning: { support: true, efforts: ['low', 'high', 'max'] },
        sampling: {
          temperature: { condition: 'Only 1; other values are omitted.' },
          topP: true,
          logprobs: false,
        },
        structuredOutput: { jsonSchema: true },
      },
    },
    providerOptions: {
      language: {
        user: true,
        reasoningEffort: {
          condition: '`none` and `null` are rejected.',
        },
        textVerbosity: true,
        strictJsonSchema: true,
      },
    },
    requestConfig: { language: subquadraticRequestDefaults.language },
  } as const;
  return entry satisfies ModelEntry<{
    language: typeof subquadraticRequestDefaults.language;
  }>;
}

// These adapter limits apply to custom IDs as well as catalog models.
export const subquadraticDecisionModelLimits = {
  supportedQuestionTypes: ['choice', 'score', 'boolean'],
  maxQuestions: 128,
  minChoiceOptions: 2,
  maxChoiceOptions: 255,
  minScoreLevels: 2,
  maxScoreLevels: 10,
} as const;

const decisionModelIds = ['subq-snap-1.2', 'subq-snap-latest'] as const;

export function getSubquadraticDecisionModelEntry(_modelId: string) {
  return {
    capabilities: {
      decision: {
        questionTypes: { boolean: true, choice: true, score: true, box: false },
        inputs: { image: true },
        reasoning: false,
        maxOutputTokens: false,
        ...subquadraticDecisionModelLimits,
      },
    },
  } satisfies ModelEntry;
}

export const subquadraticModelCatalog = Object.fromEntries([
  ...languageModelIds.map(id => [id, getSubquadraticLanguageModelEntry(id)]),
  ...decisionModelIds.map(id => [id, getSubquadraticDecisionModelEntry(id)]),
]);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type SubquadraticModelIds = {
  language: (typeof languageModelIds)[number];
  decision: (typeof decisionModelIds)[number];
};
