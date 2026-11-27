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

// Language models (Converse API)

/**
 * The request field that carries a reasoning effort:
 *
 * - `reasoning.effort`: sent as a nested `reasoning.effort`, with any effort.
 * - `reasoning_effort`: sent as a flat `reasoning_effort` of low, medium, or
 *   high.
 * - `reasoningConfig`: sent as `reasoningConfig.maxReasoningEffort` of low,
 *   medium, or high. Reasoning is off unless an effort is sent.
 * - `unknown`: it is not known whether the model reasons. The portable
 *   reasoning setting is not sent. An explicit `reasoningConfig` provider
 *   option is sent as `reasoningConfig`.
 */
export type AmazonBedrockReasoningEffortField =
  | 'reasoning.effort'
  | 'reasoning_effort'
  | 'reasoningConfig'
  | 'unknown';

/** A call setting that a model rejects on the Converse API. */
export type AmazonBedrockRejectedSetting =
  | 'temperature'
  | 'topP'
  | 'stopSequences';

/**
 * The cells of a Claude model. A Claude model on Bedrock extends a model of
 * the Anthropic provider: the row names that model, and the other cells are
 * the restrictions of Bedrock, whose Messages schema differs from the one of
 * the Anthropic API. Reasoning and sampling come from the Anthropic model.
 */
type AmazonBedrockClaudeCells = {
  claude: true;
  /** Model ID in `@ai-sdk/anthropic` that this model extends. */
  anthropicModelId: string;
  /** Bedrock accepts `strict` on the tools of this model. */
  strictTools: boolean;
  /** Bedrock accepts native structured output for this model. */
  nativeStructuredOutput: boolean;
  /** Accepts the `thinking` field. Claude 3.5 and earlier reject it. */
  thinkingField: boolean;
};

/** The cells of every other model. Each cell drives one request behavior. */
type AmazonBedrockConverseCells = {
  /**
   * `false`: not a Claude model. `'unknown'`: an application inference
   * profile, which does not name its model. It is treated as a Claude model
   * when a reasoning budget is set.
   */
  claude: false | 'unknown';
  reasoningEffort: AmazonBedrockReasoningEffortField;
  /**
   * Call settings that the model rejects. They are removed from the request
   * with a warning. A temperature that is not rejected is clamped to 0-1.
   */
  rejectedSettings: readonly AmazonBedrockRejectedSetting[];
  /** `mistral`: tool call IDs must be 9 alphanumeric characters. */
  toolCallIdFormat: 'any' | 'mistral';
};

/**
 * One row of the language model matrix. A row is either a Claude model or
 * another model, and has the cells of that kind only.
 */
export type AmazonBedrockLanguageModelRow = {
  image: ModelCapability;
  objectGeneration: ModelCapability;
  /**
   * `false`: the model does not call function tools. Otherwise it does, and
   * the list holds what it supports on top of that: `streaming` means it
   * also calls tools in a streamed response. `'unknown'`: not documented.
   */
  functionTools: 'unknown' | false | readonly 'streaming'[];
} & (AmazonBedrockClaudeCells | AmazonBedrockConverseCells);

/**
 * Language model matrix: model IDs by capability. To add a model, add a row
 * and fill in every column.
 */
const languageModelDefinitions = {
  'amazon.titan-tg1-large': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'amazon.titan-text-express-v1': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'anthropic.claude-v2': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: true,
    anthropicModelId: 'claude-2.0',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-v2:1': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: true,
    anthropicModelId: 'claude-2.1',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-instant-v1': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: true,
    anthropicModelId: 'claude-instant-1.2',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-sonnet-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-sonnet-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-sonnet-5-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-sonnet-5-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-haiku-5-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-haiku-5-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-fable-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'anthropic.claude-fable-5-1': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5-1',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'anthropic.claude-fable-5-2': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5-2',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'anthropic.claude-opus-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-opus-5-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-5-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-opus-4-8': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-8',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'anthropic.claude-opus-4-7': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-7',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'anthropic.claude-opus-4-6-v1': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-6',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-sonnet-4-6-v1': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-sonnet-4-6',
    strictTools: true,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'anthropic.claude-opus-4-5-20251101-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-5-20251101',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-haiku-4-5-20251001-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-haiku-4-5-20251001',
    strictTools: true,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'anthropic.claude-sonnet-4-5-20250929-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-sonnet-4-5-20250929',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-sonnet-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-sonnet-4-20250514',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-opus-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-opus-4-20250514',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-opus-4-1-20250805-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-opus-4-1-20250805',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-3-7-sonnet-20250219-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-3-7-sonnet-20250219',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-5-sonnet-20240620',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-5-sonnet-20241022',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-3-5-haiku-20241022-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-3-5-haiku-20241022',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-sonnet-20240229',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-haiku-20240307',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'anthropic.claude-3-opus-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-opus-20240229',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'cohere.command-text-v14': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'cohere.command-light-text-v14': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'cohere.command-r-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: [],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'cohere.command-r-plus-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: [],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-70b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-8b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-1-405b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-1-70b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-1-8b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-2-11b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-2-1b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-2-3b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'meta.llama3-2-90b-instruct-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'mistral.mistral-7b-instruct-v0:2': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'mistral',
  },
  'mistral.mixtral-8x7b-instruct-v0:1': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'mistral',
  },
  'mistral.mistral-large-2402-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'mistral',
  },
  'mistral.mistral-small-2402-v1:0': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'mistral',
  },
  'openai.gpt-oss-120b-1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'reasoning_effort',
    rejectedSettings: ['stopSequences'],
    toolCallIdFormat: 'any',
  },
  'openai.gpt-oss-20b-1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'reasoning_effort',
    rejectedSettings: ['stopSequences'],
    toolCallIdFormat: 'any',
  },
  'amazon.titan-text-lite-v1': {
    image: false,
    objectGeneration: false,
    functionTools: false,
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.amazon.nova-premier-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.amazon.nova-pro-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.amazon.nova-micro-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.amazon.nova-lite-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.anthropic.claude-3-sonnet-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-sonnet-20240229',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'us.anthropic.claude-3-opus-20240229-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-opus-20240229',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'us.anthropic.claude-3-haiku-20240307-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-haiku-20240307',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'us.anthropic.claude-3-5-sonnet-20240620-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-5-sonnet-20240620',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-3-5-haiku-20241022',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-3-5-sonnet-20241022',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: false,
  },
  'us.anthropic.claude-3-7-sonnet-20250219-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-3-7-sonnet-20250219',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-sonnet-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-sonnet-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-sonnet-5-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-sonnet-5-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-haiku-5-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-haiku-5-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-fable-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'us.anthropic.claude-fable-5-1': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5-1',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'us.anthropic.claude-fable-5-2': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5-2',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-5-5': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-5-5',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-4-8': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-8',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-4-7': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-7',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-4-6-v1': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-6',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-sonnet-4-6-v1': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-sonnet-4-6',
    strictTools: true,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-4-5-20251101-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-opus-4-5-20251101',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-sonnet-4-5-20250929',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-sonnet-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-sonnet-4-20250514',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-4-20250514-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-opus-4-20250514',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-opus-4-1-20250805-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: true,
    anthropicModelId: 'claude-opus-4-1-20250805',
    strictTools: true,
    nativeStructuredOutput: true,
    thinkingField: true,
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-haiku-4-5-20251001',
    strictTools: true,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'global.anthropic.claude-fable-5-1': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5-1',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'global.anthropic.claude-fable-5-2': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: true,
    anthropicModelId: 'claude-fable-5-2',
    strictTools: false,
    nativeStructuredOutput: false,
    thinkingField: true,
  },
  'us.meta.llama3-2-11b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.meta.llama3-2-3b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.meta.llama3-2-90b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.meta.llama3-2-1b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.meta.llama3-1-8b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.meta.llama3-1-70b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.meta.llama3-3-70b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.deepseek.r1-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.mistral.pixtral-large-2502-v1:0': {
    image: true,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'mistral',
  },
  'us.meta.llama4-scout-17b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'us.meta.llama4-maverick-17b-instruct-v1:0': {
    image: false,
    objectGeneration: true,
    functionTools: ['streaming'],
    claude: false,
    reasoningEffort: 'unknown',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
  'amazon.nova-2-lite-v1:0': {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
    claude: false,
    reasoningEffort: 'reasoningConfig',
    rejectedSettings: [],
    toolCallIdFormat: 'any',
  },
} satisfies Record<string, AmazonBedrockLanguageModelRow>;

type LanguageRequestConfig = Pick<
  AmazonBedrockClaudeCells,
  'anthropicModelId' | 'thinkingField'
> &
  Omit<AmazonBedrockConverseCells, 'claude'> & {
    claude: boolean | 'unknown';
  };

type LanguageEntry = ModelEntry<{ language: LanguageRequestConfig }> & {
  capabilities: {
    language: NonNullable<ModelCapabilities['language']> & {
      structuredOutput: { native: boolean };
      tools: NonNullable<ModelCapabilities['language']>['tools'] & {
        strict: boolean;
      };
    };
  };
  requestConfig: { language: LanguageRequestConfig };
};

/**
 * Request behavior of a Claude model for the cells that only other models
 * declare: nothing is rejected or normalized.
 */
const claudeConverseCells: Omit<AmazonBedrockConverseCells, 'claude'> = {
  reasoningEffort: 'unknown',
  rejectedSettings: [],
  toolCallIdFormat: 'any',
};

/**
 * Maps a matrix row to its entry. The capabilities of a Claude model come
 * from the Anthropic model that the row extends.
 */
function createLanguageModelEntry(
  modelId: string,
  row: AmazonBedrockLanguageModelRow,
): LanguageEntry {
  // A row of another model has no Claude cells. They are still needed when
  // the `modelFamily: 'anthropic'` provider setting treats the model as a
  // Claude model, and are then resolved like those of an unlisted model ID.
  const claude = row.claude === true ? row : getUnlistedClaudeCells(modelId);
  const converse = row.claude === true ? claudeConverseCells : row;
  const anthropic = getModelCapabilities(claude.anthropicModelId);
  const sampling: ModelCapability = anthropic.rejectsSamplingParameters
    ? false
    : true;
  return {
    capabilities: {
      language: {
        inputs: { image: row.image, audio: 'unknown' },
        objectGeneration: row.objectGeneration,
        tools: {
          usage:
            row.functionTools === 'unknown'
              ? 'unknown'
              : row.functionTools !== false,
          streaming:
            row.functionTools === 'unknown'
              ? 'unknown'
              : row.functionTools !== false &&
                row.functionTools.includes('streaming'),
          strict: claude.strictTools,
        },
        reasoning: {
          support: converse.reasoningEffort === 'unknown' ? 'unknown' : true,
        },
        sampling: { temperature: sampling, topP: sampling, logprobs: false },
        structuredOutput: { native: claude.nativeStructuredOutput },
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
        claude: row.claude,
        anthropicModelId: claude.anthropicModelId,
        thinkingField: claude.thinkingField,
        reasoningEffort: converse.reasoningEffort,
        rejectedSettings: converse.rejectedSettings,
        toolCallIdFormat: converse.toolCallIdFormat,
      },
    },
  };
}

/*
 * Fallback for language model IDs that are not listed in the matrix, such as
 * regional and global inference profiles, ARNs, and new models. It derives
 * the cells from the model ID, so that those models
 * keep working before they are listed.
 */

function getUnlistedLanguageModelRow(
  modelId: string,
): AmazonBedrockLanguageModelRow {
  const undocumented = {
    image: 'unknown',
    objectGeneration: 'unknown',
    functionTools: 'unknown',
  } as const;

  if (modelId.includes('anthropic')) {
    return { ...undocumented, ...getUnlistedClaudeCells(modelId) };
  }

  const openaiModelId = /^(?:[^.]+\.)?(openai\..+)$/.exec(modelId)?.[1];
  const openaiGptOss = openaiModelId?.startsWith('openai.gpt-oss-') ?? false;
  return {
    ...undocumented,
    claude: modelId.includes(':application-inference-profile/')
      ? 'unknown'
      : false,
    reasoningEffort:
      openaiModelId != null
        ? openaiGptOss
          ? 'reasoning_effort'
          : 'reasoning.effort'
        : modelId.includes('amazon.nova-2-lite-v1:0')
          ? 'reasoningConfig'
          : 'unknown',
    rejectedSettings:
      openaiModelId == null
        ? []
        : openaiGptOss
          ? ['stopSequences']
          : ['temperature', 'topP', 'stopSequences'],
    toolCallIdFormat: modelId.includes('mistral.') ? 'mistral' : 'any',
  };
}

function getUnlistedClaudeCells(modelId: string): AmazonBedrockClaudeCells {
  return {
    claude: true,
    // The Anthropic provider resolves the Bedrock model ID with its own
    // fallback for unlisted model IDs.
    anthropicModelId: modelId,
    ...getUnlistedClaudeStructuredOutput(modelId),
    thinkingField:
      !/claude-(?:instant|v?2|3-(?:5-)?(?:haiku|sonnet|opus))(?=[-.:]|$)/.test(
        modelId,
      ),
  };
}

type ClaudeStructuredOutput = Pick<
  AmazonBedrockClaudeCells,
  'strictTools' | 'nativeStructuredOutput'
>;

const strictToolsAndNativeOutput: ClaudeStructuredOutput = {
  strictTools: true,
  nativeStructuredOutput: true,
};
const strictToolsOnly: ClaudeStructuredOutput = {
  strictTools: true,
  nativeStructuredOutput: false,
};
const noStrictToolsOrNativeOutput: ClaudeStructuredOutput = {
  strictTools: false,
  nativeStructuredOutput: false,
};

// Claude models by name, for unlisted IDs that name one of them with another
// regional prefix, release date, or Bedrock revision.
const unlistedClaudeStructuredOutput: Readonly<
  Record<string, ClaudeStructuredOutput>
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
  'claude-fable-5-2': noStrictToolsOrNativeOutput,
};

function getUnlistedClaudeStructuredOutput(
  modelId: string,
): ClaudeStructuredOutput {
  // Bedrock does not restrict non-Claude models, opaque inference profiles,
  // and legacy Claude IDs.
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
      unlistedClaudeStructuredOutput,
      canonicalModelId,
    )
    ? unlistedClaudeStructuredOutput[canonicalModelId]
    : noStrictToolsOrNativeOutput;
}

// Language model entries. They are built after the fallback, because a row
// of another model resolves its Claude cells with it.

const listedLanguageModelEntries: Readonly<Record<string, LanguageEntry>> =
  Object.fromEntries(
    Object.entries<AmazonBedrockLanguageModelRow>(languageModelDefinitions).map(
      ([modelId, row]) => [modelId, createLanguageModelEntry(modelId, row)],
    ),
  );

/**
 * Returns the entry of a listed language model ID from its row. Every other
 * model ID uses the fallback for unlisted IDs.
 */
export function getAmazonBedrockLanguageModelEntry(
  modelId: string,
): LanguageEntry {
  return Object.prototype.hasOwnProperty.call(
    listedLanguageModelEntries,
    modelId,
  )
    ? listedLanguageModelEntries[modelId]
    : createLanguageModelEntry(modelId, getUnlistedLanguageModelRow(modelId));
}

// Embedding models

/** The family decides the request format and which provider options apply. */
type AmazonBedrockEmbeddingModelFamily = 'titan' | 'nova' | 'cohere';

/** One row of the embedding model matrix. */
export type AmazonBedrockEmbeddingModelRow = {
  family: AmazonBedrockEmbeddingModelFamily;
  defaultDimensions: number;
  customDimensions: boolean;
};

const embeddingModelDefinitions = {
  'amazon.titan-embed-text-v1': {
    family: 'titan',
    defaultDimensions: 1536,
    customDimensions: false,
  },
  'amazon.titan-embed-text-v2:0': {
    family: 'titan',
    defaultDimensions: 1024,
    customDimensions: true,
  },
  'amazon.nova-embed-text-v2:0': {
    family: 'nova',
    defaultDimensions: 1024,
    customDimensions: true,
  },
  'cohere.embed-english-v3': {
    family: 'cohere',
    defaultDimensions: 1024,
    customDimensions: false,
  },
  'cohere.embed-multilingual-v3': {
    family: 'cohere',
    defaultDimensions: 1024,
    customDimensions: false,
  },
  'cohere.embed-v4:0': {
    family: 'cohere',
    defaultDimensions: 1536,
    customDimensions: true,
  },
} satisfies Record<string, AmazonBedrockEmbeddingModelRow>;

function createEmbeddingModelEntry(
  row: AmazonBedrockEmbeddingModelRow,
): ModelEntry {
  const { family, defaultDimensions, customDimensions } = row;
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

/**
 * Returns the family of a listed embedding model ID from its row. For every
 * other model ID, the family is derived from the model ID.
 */
export function getAmazonBedrockEmbeddingModelFamily(
  modelId: string,
): AmazonBedrockEmbeddingModelFamily {
  if (
    Object.prototype.hasOwnProperty.call(embeddingModelDefinitions, modelId)
  ) {
    return embeddingModelDefinitions[
      modelId as keyof typeof embeddingModelDefinitions
    ].family;
  }

  return modelId.includes('amazon.nova-') && modelId.includes('embed')
    ? 'nova'
    : modelId.includes('cohere.embed-')
      ? 'cohere'
      : 'titan';
}

// Image models

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

// Reranking models. No capability differs between them, so there is no matrix.

const rerankingModelIds = [
  'amazon.rerank-v1:0',
  'cohere.rerank-v3-5:0',
] as const;

const rerankingEntry = {
  capabilities: {
    reranking: { documents: { text: true, object: true }, topN: true },
  },
  providerOptions: {
    reranking: { nextToken: true, additionalModelRequestFields: true },
  },
} satisfies ModelEntry;

// Model catalog (Converse API and the other model types)

export const amazonBedrockModelCatalog: Readonly<
  Record<string, ModelEntry<LanguageEntry['requestConfig']>>
> = {
  ...listedLanguageModelEntries,
  ...Object.fromEntries(
    Object.entries<AmazonBedrockEmbeddingModelRow>(
      embeddingModelDefinitions,
    ).map(([id, row]) => [id, createEmbeddingModelEntry(row)]),
  ),
  ...Object.fromEntries(rerankingModelIds.map(id => [id, rerankingEntry])),
  ...amazonBedrockImageModelCatalog,
};

// Claude models on the native Anthropic endpoint

/**
 * One row of the matrix for the native Anthropic endpoint, whose capabilities
 * are distinct from those of the Converse API.
 */
export type AmazonBedrockAnthropicModelRow = {
  /**
   * `false` keeps a known model ID out of the exported catalog and the
   * generated documentation.
   */
  documented: boolean;
  computerUse: ModelCapability;
  reasoning: ModelCapability;
};

const anthropicModelDefinitions = {
  'us.anthropic.claude-fable-5-1': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-fable-5-2': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-sonnet-5-5': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-sonnet-5': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-haiku-5-5': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-fable-5': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-8': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-7': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-6-v1': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-5-20251101-v1:0': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-20250514-v1:0': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-sonnet-4-20250514-v1:0': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-opus-4-1-20250805-v1:0': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
    documented: true,
    computerUse: true,
    reasoning: true,
  },
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': {
    documented: true,
    computerUse: false,
    reasoning: false,
  },
  'anthropic.claude-3-5-haiku-20241022-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-3-7-sonnet-20250219-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-3-opus-20240229-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-fable-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-fable-5-1': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-fable-5-2': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-haiku-4-5-20251001-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-haiku-5-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-4-1-20250805-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-4-20250514-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-4-5-20251101-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-4-6-v1': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-4-7': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-4-8': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-opus-5-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-sonnet-4-20250514-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-sonnet-4-5-20250929-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-sonnet-4-6-v1': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-sonnet-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'anthropic.claude-sonnet-5-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'global.anthropic.claude-fable-5-1': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'global.anthropic.claude-fable-5-2': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-3-5-sonnet-20240620-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-3-7-sonnet-20250219-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-3-haiku-20240307-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-3-opus-20240229-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-3-sonnet-20240229-v1:0': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-opus-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-opus-5-5': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
  'us.anthropic.claude-sonnet-4-6-v1': {
    documented: false,
    computerUse: 'unknown',
    reasoning: 'unknown',
  },
} satisfies Record<string, AmazonBedrockAnthropicModelRow>;

export const amazonBedrockAnthropicModelCatalog = Object.fromEntries(
  Object.entries<AmazonBedrockAnthropicModelRow>(anthropicModelDefinitions)
    .filter(([, row]) => row.documented)
    .map(([id, row]) => {
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
              computerUse: row.computerUse,
            },
            reasoning: { support: row.reasoning },
          },
        },
      } as const;
      return [id, entry satisfies ModelEntry];
    }),
);

// Models on Bedrock Mantle (OpenAI-compatible endpoints)

type AmazonBedrockMantleRoute = 'openai/v1' | 'v1';

/** One row of the Mantle model matrix. Every model has Chat Completions. */
export type AmazonBedrockMantleModelRow = {
  /** Also available on the Responses API. */
  responses: boolean;
  /** Path of the endpoint that serves the model. */
  route: AmazonBedrockMantleRoute;
};

const mantleModelDefinitions = {
  'openai.gpt-oss-20b': { responses: true, route: 'v1' },
  'openai.gpt-oss-120b': { responses: true, route: 'v1' },
  'openai.gpt-oss-safeguard-20b': { responses: false, route: 'v1' },
  'openai.gpt-oss-safeguard-120b': { responses: false, route: 'v1' },
} satisfies Record<string, AmazonBedrockMantleModelRow>;

export const amazonBedrockMantleModelCatalog = Object.fromEntries(
  Object.entries<AmazonBedrockMantleModelRow>(mantleModelDefinitions).map(
    ([id, row]) => {
      const entry = {
        capabilities: {
          language: {
            ...getAmazonBedrockLanguageModelEntry(id).capabilities.language,
            endpoints: { chatCompletions: true, responses: row.responses },
          },
        },
      } as const;
      return [id, entry satisfies ModelEntry];
    },
  ),
);

/**
 * Returns the route of a listed Mantle model ID from its row. For every other
 * model ID, the route is derived from the model ID.
 */
export function getAmazonBedrockMantleRoute(
  modelId: string,
): AmazonBedrockMantleRoute {
  if (Object.prototype.hasOwnProperty.call(mantleModelDefinitions, modelId)) {
    return mantleModelDefinitions[
      modelId as keyof typeof mantleModelDefinitions
    ].route;
  }

  return /^(?:openai\.gpt-(?!oss-)|google\.gemma-4|xai\.)/.test(modelId)
    ? 'openai/v1'
    : 'v1';
}

/** Known model IDs, derived from the matrices used to build the catalog. */
export type AmazonBedrockModelIds = {
  language: keyof typeof languageModelDefinitions;
  embedding: keyof typeof embeddingModelDefinitions;
  reranking: (typeof rerankingModelIds)[number];
  image: keyof typeof amazonBedrockImageModelCatalog;
  anthropic: keyof typeof anthropicModelDefinitions;
  mantleChat: keyof typeof mantleModelDefinitions;
  mantleResponses: {
    [Id in keyof typeof mantleModelDefinitions]: (typeof mantleModelDefinitions)[Id]['responses'] extends true
      ? Id
      : never;
  }[keyof typeof mantleModelDefinitions];
};
