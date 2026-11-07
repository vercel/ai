import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import { getModelCapabilities } from '@ai-sdk/anthropic/internal';
import type { AmazonBedrockLanguageModelChatOptions } from './amazon-bedrock-chat-language-model-options';
import type { AmazonBedrockEmbeddingModelOptions } from './amazon-bedrock-embedding-model-options';
import type { AmazonBedrockImageModelOptions } from './amazon-bedrock-image-model-options';
import type { AmazonBedrockRerankingModelOptions } from './reranking/amazon-bedrock-reranking-model-options';

/** Options under amazonBedrock, with bedrock retained as a legacy alias. */
export const amazonBedrockProviderOptions = {
  language: {
    structuredOutputMode: {
      description: 'Select native structured output or JSON tools.',
    },
    additionalModelRequestFields: {
      description: 'Additional model-specific inference fields.',
    },
    reasoningConfig: {
      description: 'Thinking mode, budget, effort, and display.',
    },
    anthropicBeta: { description: 'Anthropic beta features to enable.' },
    serviceTier: { description: 'Request service tier.' },
    requestMetadata: {
      description: 'Invocation logging and cost attribution metadata.',
    },
  } satisfies Record<
    keyof AmazonBedrockLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
  embedding: {
    dimensions: { description: 'Titan v2 output dimensions.' },
    normalize: { description: 'Normalize Titan v2 embeddings.' },
    embeddingDimension: { description: 'Nova output dimensions.' },
    embeddingPurpose: { description: 'Nova embedding purpose.' },
    inputType: { description: 'Cohere embedding input type.' },
    truncate: { description: 'Cohere or Nova truncation mode.' },
    outputDimension: { description: 'Cohere v4 output dimensions.' },
  } satisfies Record<
    keyof AmazonBedrockEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  image: {
    quality: { description: 'Image quality.' },
    negativeText: { description: 'Content to avoid.' },
    cfgScale: { description: 'Prompt adherence scale.' },
    style: { description: 'Image generation style.' },
    taskType: {
      description:
        'Generation, variation, inpainting, outpainting, or background removal.',
    },
    maskPrompt: { description: 'Text describing the region to mask.' },
    outPaintingMode: { description: 'Outpainting mode.' },
    similarityStrength: { description: 'Similarity to reference images.' },
  } satisfies Record<
    keyof AmazonBedrockImageModelOptions,
    ProviderOptionDefinition
  >,
  reranking: {
    nextToken: { description: 'Pagination token.' },
    additionalModelRequestFields: {
      description: 'Additional model-specific reranking fields.',
    },
  } satisfies Record<
    keyof AmazonBedrockRerankingModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

type BedrockStructuredOutputCapabilities = {
  tools: { strict: boolean };
  structuredOutput: { native: boolean };
};

const strictToolsAndNativeOutput = {
  tools: { strict: true },
  structuredOutput: { native: true },
} satisfies BedrockStructuredOutputCapabilities;

const strictToolsOnly = {
  tools: { strict: true },
  structuredOutput: { native: false },
} satisfies BedrockStructuredOutputCapabilities;

const noStrictToolsOrNativeOutput = {
  tools: { strict: false },
  structuredOutput: { native: false },
} satisfies BedrockStructuredOutputCapabilities;

// Bedrock's Messages schema differs from Anthropic's. Declare its support on
// each model instead of maintaining a separate regex support allowlist.
const claudeStructuredOutputCapabilities: Readonly<
  Record<string, BedrockStructuredOutputCapabilities>
> = {
  'claude-opus-4': strictToolsAndNativeOutput,
  'claude-sonnet-4': strictToolsAndNativeOutput,
  'claude-opus-4-1': strictToolsAndNativeOutput,
  'claude-opus-4-5': strictToolsAndNativeOutput,
  'claude-sonnet-4-5': strictToolsAndNativeOutput,
  'claude-haiku-4-5': strictToolsOnly,
  'claude-opus-4-6': strictToolsAndNativeOutput,
  'claude-sonnet-4-6': strictToolsOnly,
  'claude-opus-4-7': noStrictToolsOrNativeOutput,
  'claude-opus-4-8': noStrictToolsOrNativeOutput,
  'claude-opus-5': strictToolsAndNativeOutput,
  'claude-sonnet-5': strictToolsAndNativeOutput,
  'claude-opus-5-5': strictToolsAndNativeOutput,
  'claude-sonnet-5-5': strictToolsAndNativeOutput,
  'claude-haiku-5-5': strictToolsAndNativeOutput,
  'claude-fable-5': noStrictToolsOrNativeOutput,
  'claude-fable-5-1': noStrictToolsOrNativeOutput,
};

function resolveClaudeStructuredOutputCapabilities(
  modelId: string,
): BedrockStructuredOutputCapabilities {
  // Preserve the existing request fallback for non-Claude models, opaque
  // inference profiles, and legacy Claude IDs.
  if (
    !modelId.includes('claude-') ||
    /claude-(?:instant|v?2|3)(?=[-.:]|$)/.test(modelId)
  ) {
    return strictToolsAndNativeOutput;
  }

  // Normalize regional/provider prefixes, release dates, and Bedrock revisions.
  // Claude 4 minor-version IDs historically accept additional suffixes; other
  // aliases must end at a version, release date, or Bedrock revision.
  const canonicalModelId =
    /claude-[a-z]+-4-\d{1,2}(?=[-.:]|$)/.exec(modelId)?.[0] ??
    /(claude-[a-z]+-\d+(?:-\d{1,2})?)(?:-\d{8})?(?:-v\d+)?(?=[:.]|$)/.exec(
      modelId,
    )?.[1];

  return canonicalModelId != null &&
    Object.prototype.hasOwnProperty.call(
      claudeStructuredOutputCapabilities,
      canonicalModelId,
    )
    ? claudeStructuredOutputCapabilities[canonicalModelId]
    : noStrictToolsOrNativeOutput;
}

type LanguageEntry = ModelEntry<{
  language: {
    anthropic: boolean;
    applicationInferenceProfile: boolean;
    claude: boolean;
    mistral: boolean;
    openai: boolean;
    openaiGptOss: boolean;
    openaiGptOssReasoning: boolean;
    nova2Reasoning: boolean;
    mantleRoute: 'openai/v1' | 'v1';
  };
}> & {
  capabilities: {
    language: NonNullable<ModelCapabilities['language']> & {
      structuredOutput: { native: boolean };
      tools: NonNullable<ModelCapabilities['language']>['tools'] & {
        strict: boolean;
      };
    };
  };
  requestConfig: {
    language: {
      anthropic: boolean;
      applicationInferenceProfile: boolean;
      claude: boolean;
      mistral: boolean;
      openai: boolean;
      openaiGptOss: boolean;
      openaiGptOssReasoning: boolean;
      nova2Reasoning: boolean;
      mantleRoute: 'openai/v1' | 'v1';
    };
  };
};

const documentedLanguageModels: Record<
  string,
  {
    image: boolean;
    objectGeneration: boolean;
    tools: boolean;
    streaming: boolean;
  }
> = {
  'amazon.titan-tg1-large': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'amazon.titan-text-express-v1': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'amazon.titan-text-lite-v1': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'us.amazon.nova-premier-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.amazon.nova-pro-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.amazon.nova-lite-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.amazon.nova-micro-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-haiku-4-5-20251001-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-sonnet-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-sonnet-4-5-20250929-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-opus-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-opus-4-1-20250805-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-3-opus-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-sonnet-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-opus-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-opus-4-1-20250805-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-3-5-sonnet-20240620-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-3-sonnet-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-3-opus-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.anthropic.claude-3-haiku-20240307-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'anthropic.claude-v2': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'anthropic.claude-v2:1': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'anthropic.claude-instant-v1': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'cohere.command-text-v14': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'cohere.command-light-text-v14': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'cohere.command-r-v1:0': {
    image: false,
    objectGeneration: false,
    tools: true,
    streaming: false,
  },
  'cohere.command-r-plus-v1:0': {
    image: false,
    objectGeneration: false,
    tools: true,
    streaming: false,
  },
  'us.deepseek.r1-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'meta.llama3-8b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-70b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-1-8b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-1-70b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-1-405b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-2-1b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-2-3b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-2-11b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'meta.llama3-2-90b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'us.meta.llama3-2-1b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama3-2-3b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama3-2-11b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama3-2-90b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama3-1-8b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama3-1-70b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama3-3-70b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama4-scout-17b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'us.meta.llama4-maverick-17b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'mistral.mistral-7b-instruct-v0:2': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'mistral.mixtral-8x7b-instruct-v0:1': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'mistral.mistral-large-2402-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'mistral.mistral-small-2402-v1:0': {
    image: false,
    objectGeneration: false,
    tools: false,
    streaming: false,
  },
  'us.mistral.pixtral-large-2502-v1:0': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'openai.gpt-oss-120b-1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
  'openai.gpt-oss-20b-1:0': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
  },
};

function createLanguageEntry(modelId: string): LanguageEntry {
  const documented = documentedLanguageModels[modelId];
  const anthropic = getModelCapabilities(modelId);
  const claude = modelId.includes('claude-');
  const structuredOutputCapabilities =
    resolveClaudeStructuredOutputCapabilities(modelId);
  const openaiModelId = /^(?:[^.]+\.)?(openai\..+)$/.exec(modelId)?.[1];
  const nova2Reasoning = modelId.includes('amazon.nova-2-lite-v1:0');
  const sampling: ModelCapability = anthropic.rejectsSamplingParameters
    ? false
    : true;
  return {
    capabilities: {
      language: {
        inputs: { image: documented?.image ?? 'unknown', audio: 'unknown' },
        objectGeneration: documented?.objectGeneration ?? 'unknown',
        tools: {
          usage: documented?.tools ?? 'unknown',
          streaming: documented?.streaming ?? 'unknown',
          strict: structuredOutputCapabilities.tools.strict,
        },
        reasoning: {
          support: openaiModelId != null || nova2Reasoning ? true : 'unknown',
        },
        sampling: { temperature: sampling, topP: sampling, logprobs: false },
        structuredOutput: structuredOutputCapabilities.structuredOutput,
      },
    },
    providerOptions: {
      language: {
        structuredOutputMode: {
          condition:
            'Applies to Anthropic models; auto preserves each model’s native-output policy.',
        },
        additionalModelRequestFields: true,
        reasoningConfig: {
          condition:
            'Supported reasoning configuration depends on the underlying model.',
        },
        anthropicBeta: {
          condition: 'Requires an Anthropic model and a supported beta.',
        },
        serviceTier: {
          condition:
            'Requires a model and region supporting the selected tier.',
        },
        requestMetadata: true,
      },
    },
    requestConfig: {
      language: {
        anthropic: modelId.includes('anthropic'),
        applicationInferenceProfile: modelId.includes(
          ':application-inference-profile/',
        ),
        claude,
        mistral: modelId.includes('mistral.'),
        openai: openaiModelId != null,
        openaiGptOss: openaiModelId?.startsWith('openai.gpt-oss-') ?? false,
        openaiGptOssReasoning: modelId.includes('openai.gpt-oss-'),
        nova2Reasoning,
        mantleRoute: /^(?:openai\.gpt-(?!oss-)|google\.gemma-4|xai\.)/.test(
          modelId,
        )
          ? 'openai/v1'
          : 'v1',
      },
    },
  };
}

export function getAmazonBedrockLanguageModelEntry(
  modelId: string,
): LanguageEntry {
  const entry = Object.prototype.hasOwnProperty.call(
    amazonBedrockModelCatalog,
    modelId,
  )
    ? amazonBedrockModelCatalog[modelId]
    : undefined;
  return entry?.capabilities.language != null
    ? (entry as LanguageEntry)
    : createLanguageEntry(modelId);
}

export function getAmazonBedrockEmbeddingModelFamily(
  modelId: string,
): 'nova' | 'cohere' | 'titan' {
  return modelId.includes('amazon.nova-') && modelId.includes('embed')
    ? 'nova'
    : modelId.includes('cohere.embed-')
      ? 'cohere'
      : 'titan';
}

function embeddingEntry(
  modelId: string,
  defaultDimensions: number,
  customDimensions: boolean,
): ModelEntry {
  const family = getAmazonBedrockEmbeddingModelFamily(modelId);
  return {
    capabilities: { embedding: { defaultDimensions, customDimensions } },
    providerOptions: {
      embedding: {
        dimensions: family === 'titan' && customDimensions,
        normalize: family === 'titan' && customDimensions,
        embeddingDimension: family === 'nova',
        embeddingPurpose: family === 'nova',
        inputType: family === 'cohere',
        truncate: family !== 'titan',
        outputDimension: family === 'cohere' && customDimensions,
      },
    },
  };
}

export const amazonBedrockImageModelCatalog = {
  'amazon.nova-canvas-v1:0': {
    capabilities: {
      image: {
        sizes: {
          description:
            '320–4096 pixels per side, divisible by 16; aspect ratio 1:4 to 4:1; fewer than 4,194,304 pixels.',
        },
        fileInput: true,
        maskInput: true,
        maxImagesPerCall: 5,
      },
    },
    providerOptions: {
      image: {
        quality: true,
        negativeText: true,
        cfgScale: true,
        style: true,
        taskType: true,
        maskPrompt: true,
        outPaintingMode: true,
        similarityStrength: true,
      },
    },
  },
} satisfies Record<string, ModelEntry>;

export function getAmazonBedrockImageModelEntry(modelId: string): ModelEntry {
  return Object.prototype.hasOwnProperty.call(
    amazonBedrockImageModelCatalog,
    modelId,
  )
    ? amazonBedrockImageModelCatalog[
        modelId as keyof typeof amazonBedrockImageModelCatalog
      ]
    : {
        capabilities: {
          image: {
            sizes: { description: 'Model-dependent.' },
            fileInput: 'unknown',
            maskInput: 'unknown',
            maxImagesPerCall: undefined,
          },
        },
      };
}

const rerankingEntry = {
  capabilities: {
    reranking: { documents: { text: true, object: true }, topN: true },
  },
  providerOptions: {
    reranking: { nextToken: true, additionalModelRequestFields: true },
  },
} satisfies ModelEntry;

export const amazonBedrockModelCatalog: Readonly<
  Record<string, ModelEntry<LanguageEntry['requestConfig']>>
> = {
  ...Object.fromEntries(
    [
      'amazon.titan-tg1-large',
      'amazon.titan-text-express-v1',
      'anthropic.claude-v2',
      'anthropic.claude-v2:1',
      'anthropic.claude-instant-v1',
      'anthropic.claude-sonnet-5',
      'anthropic.claude-sonnet-5-5',
      'anthropic.claude-haiku-5-5',
      'anthropic.claude-fable-5',
      'anthropic.claude-fable-5-1',
      'anthropic.claude-opus-5',
      'anthropic.claude-opus-5-5',
      'anthropic.claude-opus-4-8',
      'anthropic.claude-opus-4-7',
      'anthropic.claude-opus-4-6-v1',
      'anthropic.claude-sonnet-4-6-v1',
      'anthropic.claude-opus-4-5-20251101-v1:0',
      'anthropic.claude-haiku-4-5-20251001-v1:0',
      'anthropic.claude-sonnet-4-5-20250929-v1:0',
      'anthropic.claude-sonnet-4-20250514-v1:0',
      'anthropic.claude-opus-4-20250514-v1:0',
      'anthropic.claude-opus-4-1-20250805-v1:0',
      'anthropic.claude-3-7-sonnet-20250219-v1:0',
      'anthropic.claude-3-5-sonnet-20240620-v1:0',
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'anthropic.claude-3-sonnet-20240229-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
      'cohere.command-text-v14',
      'cohere.command-light-text-v14',
      'cohere.command-r-v1:0',
      'cohere.command-r-plus-v1:0',
      'meta.llama3-70b-instruct-v1:0',
      'meta.llama3-8b-instruct-v1:0',
      'meta.llama3-1-405b-instruct-v1:0',
      'meta.llama3-1-70b-instruct-v1:0',
      'meta.llama3-1-8b-instruct-v1:0',
      'meta.llama3-2-11b-instruct-v1:0',
      'meta.llama3-2-1b-instruct-v1:0',
      'meta.llama3-2-3b-instruct-v1:0',
      'meta.llama3-2-90b-instruct-v1:0',
      'mistral.mistral-7b-instruct-v0:2',
      'mistral.mixtral-8x7b-instruct-v0:1',
      'mistral.mistral-large-2402-v1:0',
      'mistral.mistral-small-2402-v1:0',
      'openai.gpt-oss-120b-1:0',
      'openai.gpt-oss-20b-1:0',
      'amazon.titan-text-lite-v1',
      'us.amazon.nova-premier-v1:0',
      'us.amazon.nova-pro-v1:0',
      'us.amazon.nova-micro-v1:0',
      'us.amazon.nova-lite-v1:0',
      'us.anthropic.claude-3-sonnet-20240229-v1:0',
      'us.anthropic.claude-3-opus-20240229-v1:0',
      'us.anthropic.claude-3-haiku-20240307-v1:0',
      'us.anthropic.claude-3-5-sonnet-20240620-v1:0',
      'us.anthropic.claude-3-5-haiku-20241022-v1:0',
      'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      'us.anthropic.claude-sonnet-5',
      'us.anthropic.claude-sonnet-5-5',
      'us.anthropic.claude-haiku-5-5',
      'us.anthropic.claude-fable-5',
      'us.anthropic.claude-fable-5-1',
      'us.anthropic.claude-opus-5',
      'us.anthropic.claude-opus-5-5',
      'us.anthropic.claude-opus-4-8',
      'us.anthropic.claude-opus-4-7',
      'us.anthropic.claude-opus-4-6-v1',
      'us.anthropic.claude-sonnet-4-6-v1',
      'us.anthropic.claude-opus-4-5-20251101-v1:0',
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
      'us.anthropic.claude-opus-4-20250514-v1:0',
      'us.anthropic.claude-opus-4-1-20250805-v1:0',
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'global.anthropic.claude-fable-5-1',
      'us.meta.llama3-2-11b-instruct-v1:0',
      'us.meta.llama3-2-3b-instruct-v1:0',
      'us.meta.llama3-2-90b-instruct-v1:0',
      'us.meta.llama3-2-1b-instruct-v1:0',
      'us.meta.llama3-1-8b-instruct-v1:0',
      'us.meta.llama3-1-70b-instruct-v1:0',
      'us.meta.llama3-3-70b-instruct-v1:0',
      'us.deepseek.r1-v1:0',
      'us.mistral.pixtral-large-2502-v1:0',
      'us.meta.llama4-scout-17b-instruct-v1:0',
      'us.meta.llama4-maverick-17b-instruct-v1:0',
    ].map(id => [id, createLanguageEntry(id)]),
  ),
  'amazon.nova-2-lite-v1:0': createLanguageEntry('amazon.nova-2-lite-v1:0'),
  'amazon.titan-embed-text-v1': embeddingEntry(
    'amazon.titan-embed-text-v1',
    1536,
    false,
  ),
  'amazon.titan-embed-text-v2:0': embeddingEntry(
    'amazon.titan-embed-text-v2:0',
    1024,
    true,
  ),
  'amazon.nova-embed-text-v2:0': embeddingEntry(
    'amazon.nova-embed-text-v2:0',
    1024,
    true,
  ),
  'cohere.embed-english-v3': embeddingEntry(
    'cohere.embed-english-v3',
    1024,
    false,
  ),
  'cohere.embed-multilingual-v3': embeddingEntry(
    'cohere.embed-multilingual-v3',
    1024,
    false,
  ),
  'cohere.embed-v4:0': embeddingEntry('cohere.embed-v4:0', 1536, true),
  'amazon.rerank-v1:0': rerankingEntry,
  'cohere.rerank-v3-5:0': rerankingEntry,
  ...amazonBedrockImageModelCatalog,
};

/** Capabilities of the native Anthropic endpoint, distinct from Converse. */
const nativeAnthropicModels = {
  'us.anthropic.claude-fable-5-1': { computerUse: true, reasoning: true },
  'us.anthropic.claude-sonnet-5-5': { computerUse: true, reasoning: true },
  'us.anthropic.claude-sonnet-5': { computerUse: true, reasoning: true },
  'us.anthropic.claude-haiku-5-5': { computerUse: true, reasoning: true },
  'us.anthropic.claude-fable-5': { computerUse: true, reasoning: true },
  'us.anthropic.claude-opus-4-8': { computerUse: true, reasoning: true },
  'us.anthropic.claude-opus-4-7': { computerUse: true, reasoning: true },
  'us.anthropic.claude-opus-4-6-v1': { computerUse: true, reasoning: true },
  'us.anthropic.claude-opus-4-5-20251101-v1:0': {
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-20250514-v1:0': {
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-sonnet-4-20250514-v1:0': {
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-1-20250805-v1:0': {
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': {
    computerUse: false,
    reasoning: false,
  },
};
export const amazonBedrockAnthropicModelCatalog = Object.fromEntries(
  Object.entries(nativeAnthropicModels).map(([id, support]) => {
    const base = getAmazonBedrockLanguageModelEntry(id).capabilities.language;
    const entry = {
      capabilities: {
        language: {
          ...base,
          inputs: { image: true, audio: false },
          objectGeneration: true,
          tools: {
            ...base.tools,
            usage: true,
            streaming: true,
            computerUse: support.computerUse,
          },
          reasoning: { support: support.reasoning },
        },
      },
    } as const;
    return [id, entry satisfies ModelEntry];
  }),
);

/** Endpoint availability documented for Mantle's known GPT-OSS models. */
const mantleModels = {
  'openai.gpt-oss-20b': { chatCompletions: true, responses: true },
  'openai.gpt-oss-120b': { chatCompletions: true, responses: true },
  'openai.gpt-oss-safeguard-20b': { chatCompletions: true, responses: false },
  'openai.gpt-oss-safeguard-120b': { chatCompletions: true, responses: false },
};
export const amazonBedrockMantleModelCatalog = Object.fromEntries(
  Object.entries(mantleModels).map(([id, endpoints]) => {
    const entry = {
      capabilities: {
        language: {
          ...getAmazonBedrockLanguageModelEntry(id).capabilities.language,
          endpoints,
        },
      },
    } as const;
    return [id, entry satisfies ModelEntry];
  }),
);
