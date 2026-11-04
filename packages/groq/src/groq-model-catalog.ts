import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { GroqLanguageModelChatOptions } from './groq-chat-language-model-options';
import type { GroqTranscriptionModelOptions } from './groq-transcription-model-options';

export const groqProviderOptions = {
  language: {
    reasoningFormat: {
      description: 'How to expose reasoning in the response.',
    },
    reasoningEffort: { description: 'Reasoning effort for supported models.' },
    parallelToolCalls: { description: 'Allow parallel function calls.' },
    user: {
      description: 'End-user identifier for monitoring and abuse detection.',
    },
    structuredOutputs: { description: 'Use JSON schema response formatting.' },
    strictJsonSchema: { description: 'Use strict JSON schema validation.' },
    serviceTier: { description: 'Service tier for the request.' },
  } satisfies Record<
    keyof GroqLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    language: { description: 'Input audio language in ISO-639-1 format.' },
    prompt: { description: 'Text to guide the transcription.' },
    responseFormat: { description: 'Transcription response format.' },
    temperature: { description: 'Sampling temperature, between zero and one.' },
    timestampGranularities: {
      description: 'Segment or word timestamp granularities.',
    },
  } satisfies Record<
    keyof GroqTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

type LanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  tools: NonNullable<ModelCapabilities['language']>['tools'] & {
    browserSearch: ModelCapability;
  };
  reasoning: NonNullable<ModelCapabilities['language']>['reasoning'] & {
    efforts?: readonly NonNullable<
      GroqLanguageModelChatOptions['reasoningEffort']
    >[];
    disable: boolean;
    always: boolean;
  };
  sampling: NonNullable<ModelCapabilities['language']>['sampling'] & {
    topK: false;
  };
  structuredOutput: {
    jsonSchema: ModelCapability;
    withFunctionTools: false;
  };
};

type LanguageRequestConfig = {
  structuredOutputs: boolean;
  strictJsonSchema: boolean;
};

export type GroqLanguageModelEntry = {
  capabilities: { language: LanguageCapabilities };
  providerOptions: {
    language: Record<keyof GroqLanguageModelChatOptions, ModelCapability>;
  };
  requestConfig: { language: LanguageRequestConfig };
};

type GroqTranscriptionModelEntry = {
  capabilities: {
    transcription: NonNullable<ModelCapabilities['transcription']>;
  };
  providerOptions: {
    transcription: Record<keyof GroqTranscriptionModelOptions, ModelCapability>;
  };
};

type GroqModelEntry = ModelEntry<{
  language?: LanguageRequestConfig;
}> & {
  capabilities: ModelCapabilities & { language?: LanguageCapabilities };
  providerOptions?: {
    language?: GroqLanguageModelEntry['providerOptions']['language'];
    transcription?: GroqTranscriptionModelEntry['providerOptions']['transcription'];
  };
};

type LanguageDefinition = {
  image: boolean;
  tools: boolean;
  jsonSchema?: boolean;
};

const text = { image: false, tools: true };
const vision = { image: true, tools: true };

// Preserve the provider page's model set and per-model support declarations.
const documentedLanguageModels: Record<string, LanguageDefinition> = {
  'gemma2-9b-it': text,
  'llama-3.1-8b-instant': { ...text, jsonSchema: false },
  'llama-3.3-70b-versatile': text,
  'meta-llama/llama-guard-4-12b': { image: true, tools: false },
  'deepseek-r1-distill-llama-70b': text,
  'meta-llama/llama-4-maverick-17b-128e-instruct': vision,
  'meta-llama/llama-4-scout-17b-16e-instruct': vision,
  'meta-llama/llama-prompt-guard-2-22m': { image: false, tools: false },
  'meta-llama/llama-prompt-guard-2-86m': { image: false, tools: false },
  'moonshotai/kimi-k2-instruct-0905': { ...text, jsonSchema: true },
  'qwen/qwen3.6-27b': text,
  'llama-guard-3-8b': text,
  'llama3-70b-8192': text,
  'llama3-8b-8192': text,
  'mixtral-8x7b-32768': text,
  'qwen-qwq-32b': text,
  'qwen-2.5-32b': text,
  'deepseek-r1-distill-qwen-32b': text,
  'openai/gpt-oss-20b': text,
  'openai/gpt-oss-120b': text,
};

function createLanguageModelEntry(
  modelId: string,
  definition?: LanguageDefinition,
): GroqLanguageModelEntry {
  const support = definition != null ? true : 'unknown';
  const disable = modelId === 'qwen/qwen3.6-27b';
  // Preserve prefix matching for future/custom GPT-OSS model IDs.
  const always = modelId.startsWith('openai/gpt-oss');
  const reasoningSupport = disable || always ? true : 'unknown';
  const jsonSchema = definition?.jsonSchema ?? 'unknown';

  return {
    capabilities: {
      language: {
        inputs: { image: definition?.image ?? 'unknown', audio: false },
        objectGeneration: support,
        tools: {
          usage: definition?.tools ?? 'unknown',
          streaming: definition?.tools ?? 'unknown',
          // Only the two documented GPT-OSS IDs are known to support this.
          // Unknown IDs remain undeclared and continue to forward the tool.
          browserSearch: definition != null ? always : 'unknown',
        },
        reasoning: {
          support: reasoningSupport,
          ...(disable
            ? { efforts: ['none', 'default'] }
            : always
              ? { efforts: ['low', 'medium', 'high'] }
              : {}),
          disable,
          always,
        },
        sampling: {
          temperature: 'unknown',
          topP: 'unknown',
          logprobs: false,
          topK: false,
        },
        structuredOutput: { jsonSchema, withFunctionTools: false },
      },
    },
    providerOptions: {
      language: declareProviderOptions(groqProviderOptions.language, support, {
        reasoningFormat: reasoningSupport,
        reasoningEffort: reasoningSupport,
        structuredOutputs: jsonSchema,
        strictJsonSchema:
          jsonSchema === false
            ? false
            : {
                condition:
                  'Requires a JSON schema response with structuredOutputs enabled.',
              },
        parallelToolCalls:
          definition?.tools === false
            ? false
            : {
                condition:
                  'Disabled when JSON schema output is combined with function tools.',
              },
      }),
    },
    requestConfig: {
      language: { structuredOutputs: true, strictJsonSchema: true },
    },
  };
}

function createTranscriptionModelEntry(
  declared: boolean,
): GroqTranscriptionModelEntry {
  const support = declared ? true : 'unknown';
  const verbose: ModelCapability = declared
    ? { condition: "Returned when responseFormat is 'verbose_json'." }
    : 'unknown';
  return {
    capabilities: {
      transcription: {
        transcription: support,
        streaming: false,
        duration: verbose,
        segments: verbose,
        language: verbose,
      },
    },
    providerOptions: {
      transcription: declareProviderOptions(
        groqProviderOptions.transcription,
        support,
        {
          timestampGranularities: {
            condition: "Requires responseFormat: 'verbose_json'.",
          },
        },
      ),
    },
  };
}

export const groqModelCatalog: Readonly<Record<string, GroqModelEntry>> = {
  ...Object.fromEntries(
    Object.entries(documentedLanguageModels).map(([modelId, definition]) => [
      modelId,
      createLanguageModelEntry(modelId, definition),
    ]),
  ),
  'whisper-large-v3': createTranscriptionModelEntry(true),
  'whisper-large-v3-turbo': createTranscriptionModelEntry(true),
};

function findModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(groqModelCatalog, modelId)
    ? groqModelCatalog[modelId]
    : undefined;
}

export function getGroqLanguageModelEntry(
  modelId: string,
): GroqLanguageModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.language != null &&
    entry.providerOptions?.language != null &&
    entry.requestConfig?.language != null
    ? {
        capabilities: { language: entry.capabilities.language },
        providerOptions: { language: entry.providerOptions.language },
        requestConfig: { language: entry.requestConfig.language },
      }
    : createLanguageModelEntry(modelId);
}

export function getGroqTranscriptionModelEntry(
  modelId: string,
): GroqTranscriptionModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.transcription != null &&
    entry.providerOptions?.transcription != null
    ? {
        capabilities: { transcription: entry.capabilities.transcription },
        providerOptions: { transcription: entry.providerOptions.transcription },
      }
    : createTranscriptionModelEntry(false);
}

function declareProviderOptions<Option extends string>(
  definitions: Readonly<Record<Option, ProviderOptionDefinition>>,
  support: ModelCapability,
  exceptions: Partial<Record<Option, ModelCapability>>,
): Record<Option, ModelCapability> {
  return Object.fromEntries(
    (Object.keys(definitions) as Option[]).map(option => [
      option,
      exceptions[option] ?? support,
    ]),
  ) as Record<Option, ModelCapability>;
}
