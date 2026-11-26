import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { AnthropicLanguageModelOptions } from './anthropic-language-model-options';

type AnthropicLanguageProviderOption = keyof AnthropicLanguageModelOptions;

/**
 * Options accepted under `providerOptions.anthropic`. The `satisfies` check
 * keeps this list in sync with the option schema.
 */
export const anthropicProviderOptions = {
  language: {
    thread: { description: 'Create or continue a short-lived message thread.' },
    sendReasoning: { description: 'Whether to send reasoning to the model.' },
    includePings: { description: 'Include transient ping events in streams.' },
    midConversationSystemMessages: {
      description: 'Keep later system messages in the conversation.',
    },
    structuredOutputMode: {
      description: 'How structured outputs are generated.',
    },
    thinking: { description: 'Extended thinking configuration.' },
    disableParallelToolUse: {
      description: 'Use at most one tool per response.',
    },
    cacheControl: { description: 'Prompt cache control settings.' },
    metadata: { description: 'Request metadata, such as a user ID.' },
    mcpServers: { description: 'MCP servers to use in the request.' },
    container: { description: 'Container and Agent Skills configuration.' },
    toolStreaming: {
      description: 'Fine-grained streaming of tool inputs and outputs.',
    },
    effort: {
      description: 'Effort spent on thinking, text, and tool calls.',
    },
    taskBudget: { description: 'Advisory token budget for an agentic task.' },
    speed: { description: 'Fast mode for faster output token speeds.' },
    serviceTier: { description: 'Service tier for the request.' },
    inferenceGeo: { description: 'Where model inference runs.' },
    fallbacks: { description: 'Server-side fallback models.' },
    anthropicBeta: { description: 'Additional beta features to enable.' },
    safeguards: { description: 'Server-side safeguards to run.' },
    compaction: { description: 'On-demand conversation summary.' },
    contextManagement: { description: 'Server-side context management.' },
  } satisfies Record<AnthropicLanguageProviderOption, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

type AnthropicLanguageCapabilities = NonNullable<
  ModelCapabilities['language']
> & {
  tools: NonNullable<ModelCapabilities['language']>['tools'] & {
    forcedChoice: boolean;
    computerUse: ModelCapability;
    webSearch: ModelCapability;
    toolSearch: ModelCapability;
  };
  reasoning: NonNullable<ModelCapabilities['language']>['reasoning'] & {
    adaptive: boolean;
    budget: boolean;
    canDisable: boolean;
    canDisableAboveHighEffort: boolean;
    supportsXhighEffort: boolean;
    betweenTools: boolean;
  };
  sampling: NonNullable<ModelCapabilities['language']>['sampling'] & {
    topK: ModelCapability;
  };
  structuredOutput: {
    native: boolean;
  };
  compaction: ModelCapability;
};

type AnthropicLanguageRequestConfig = {
  maxOutputTokens: number;
  knownModel: boolean;
};

export type AnthropicLanguageModelEntry = ModelEntry<{
  language: AnthropicLanguageRequestConfig;
}> & {
  capabilities: { language: AnthropicLanguageCapabilities };
  providerOptions: {
    language: Record<AnthropicLanguageProviderOption, ModelCapability>;
  };
  requestConfig: { language: AnthropicLanguageRequestConfig };
};

// Conditional support, used as a cell value in the matrix below.
const onlyWithoutThinking = {
  condition: 'Only supported when thinking is disabled.',
} as const;

type AnthropicThinkingMode = 'adaptive' | 'budget' | 'between-tools';

/**
 * One row of the language model matrix. Every capability that differs between
 * models is its own column, and every listed model fills in every column.
 * Nothing is derived from the model ID or from another column. Facts that
 * depend on each other share one column, so a row cannot contradict itself.
 */
export type AnthropicLanguageModelRow = {
  /**
   * `false` keeps a known model ID out of the exported catalog and the
   * generated documentation. Its inputs, object generation, tools, and provider
   * options are then reported as `'unknown'`.
   */
  documented: boolean;
  /** Default maximum output tokens. */
  maxOutputTokens: number;
  /** Whether the model ID belongs to a known model family. */
  knownModel: boolean;
  nativeStructuredOutput: boolean;
  /**
   * Extended thinking. `false` means the model does not think. Otherwise the
   * cell lists the thinking modes the model accepts (at least one) and when
   * thinking can be turned off: never (`false`), only at efforts up to `high`,
   * or always.
   */
  thinking:
    | false
    | {
        modes: readonly [AnthropicThinkingMode, ...AnthropicThinkingMode[]];
        canBeDisabled: false | 'up-to-high-effort' | 'always';
      };
  /**
   * Declared reasoning efforts. `undefined` means no exhaustive list. `xhigh`
   * is supported only when it is listed here.
   */
  reasoningEfforts: readonly string[] | undefined;
  /** Temperature, topP, and topK support. */
  sampling: ModelCapability;
  forcedToolUse: boolean;
  toolSearch: ModelCapability;
  compaction: ModelCapability;
  /** `effort` provider option. It was introduced with claude-opus-4-5. */
  effort: ModelCapability;
  /** `speed` provider option (fast mode). */
  speed: ModelCapability;
  /** `taskBudget` provider option. */
  taskBudget: ModelCapability;
};

/**
 * Language model matrix: model IDs by capability. To add a model, add a row and
 * fill in every column.
 */
const languageModelDefinitions = {
  'claude-opus-5-5': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive'], canBeDisabled: false },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: false,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-opus-5': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: {
      modes: ['adaptive', 'budget'],
      canBeDisabled: 'up-to-high-effort',
    },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-sonnet-5-5': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive', 'between-tools'], canBeDisabled: false },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: false,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-sonnet-5': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive', 'budget'], canBeDisabled: 'always' },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-haiku-5-5': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive'], canBeDisabled: 'up-to-high-effort' },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-fable-5-2': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive'], canBeDisabled: false },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: false,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-fable-5-1': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive'], canBeDisabled: false },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: false,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-fable-5': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive'], canBeDisabled: false },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-opus-4-8': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive', 'budget'], canBeDisabled: 'always' },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-opus-4-7': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive', 'budget'], canBeDisabled: 'always' },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    sampling: onlyWithoutThinking,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: true,
  },
  'claude-opus-4-6': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive', 'budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: true,
    taskBudget: 'unknown',
  },
  'claude-sonnet-4-6': {
    documented: true,
    maxOutputTokens: 128000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['adaptive', 'budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: true,
    compaction: true,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-opus-4-5': {
    documented: true,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: true,
    compaction: false,
    effort: true,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-haiku-4-5': {
    documented: true,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: true,
    compaction: false,
    effort: false,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-sonnet-4-5': {
    documented: true,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: true,
    compaction: false,
    effort: false,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-opus-4-1': {
    documented: true,
    maxOutputTokens: 32000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: false,
    compaction: false,
    effort: false,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-opus-4-0': {
    documented: true,
    maxOutputTokens: 32000,
    knownModel: true,
    nativeStructuredOutput: false,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: false,
    compaction: false,
    effort: false,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-sonnet-4-0': {
    documented: true,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: false,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: false,
    compaction: false,
    effort: false,
    speed: false,
    taskBudget: 'unknown',
  },
  'claude-3-haiku-20240307': {
    documented: false,
    maxOutputTokens: 4096,
    knownModel: true,
    nativeStructuredOutput: false,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  },
  'claude-haiku-4-5-20251001': {
    documented: false,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  },
  'claude-opus-4-1-20250805': {
    documented: false,
    maxOutputTokens: 32000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  },
  'claude-opus-4-20250514': {
    documented: false,
    maxOutputTokens: 32000,
    knownModel: true,
    nativeStructuredOutput: false,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  },
  'claude-opus-4-5-20251101': {
    documented: false,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  },
  'claude-sonnet-4-20250514': {
    documented: false,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: false,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  },
  'claude-sonnet-4-5-20250929': {
    documented: false,
    maxOutputTokens: 64000,
    knownModel: true,
    nativeStructuredOutput: true,
    thinking: { modes: ['budget'], canBeDisabled: 'always' },
    reasoningEfforts: undefined,
    sampling: true,
    forcedToolUse: true,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  },
} satisfies Readonly<Record<string, AnthropicLanguageModelRow>>;

const languageModelRows = Object.entries<AnthropicLanguageModelRow>(
  languageModelDefinitions,
);

/** Entries for every listed model ID, documented or not. */
const listedLanguageModelEntries: Readonly<
  Record<string, AnthropicLanguageModelEntry>
> = Object.fromEntries(
  languageModelRows.map(([modelId, row]) => [
    modelId,
    createAnthropicLanguageModelEntry(row),
  ]),
);

export const anthropicModelCatalog: Readonly<
  Record<string, AnthropicLanguageModelEntry>
> = Object.fromEntries(
  languageModelRows
    .filter(([, row]) => row.documented)
    .map(([modelId]) => [modelId, listedLanguageModelEntries[modelId]]),
);

export function getAnthropicLanguageModelEntry(
  modelId: string,
): AnthropicLanguageModelEntry {
  return Object.prototype.hasOwnProperty.call(
    listedLanguageModelEntries,
    modelId,
  )
    ? listedLanguageModelEntries[modelId]
    : createAnthropicLanguageModelEntry(getUnlistedModelRow(modelId));
}

function createAnthropicLanguageModelEntry(
  row: AnthropicLanguageModelRow,
): AnthropicLanguageModelEntry {
  const documentedSupport: ModelCapability = row.documented ? true : 'unknown';
  const thinkingModes: readonly AnthropicThinkingMode[] =
    row.thinking === false ? [] : row.thinking.modes;
  const thinkingCanBeDisabled =
    row.thinking === false ? false : row.thinking.canBeDisabled;

  return {
    capabilities: {
      language: {
        inputs: {
          image: documentedSupport,
          audio: row.documented ? false : 'unknown',
        },
        objectGeneration: documentedSupport,
        tools: {
          usage: documentedSupport,
          streaming: documentedSupport,
          forcedChoice: row.forcedToolUse,
          computerUse: documentedSupport,
          webSearch: documentedSupport,
          toolSearch: row.toolSearch,
        },
        reasoning: {
          support: row.thinking !== false,
          efforts: row.reasoningEfforts,
          adaptive: thinkingModes.includes('adaptive'),
          budget: thinkingModes.includes('budget'),
          canDisable: thinkingCanBeDisabled !== false,
          canDisableAboveHighEffort: thinkingCanBeDisabled === 'always',
          supportsXhighEffort: row.reasoningEfforts?.includes('xhigh') ?? false,
          betweenTools: thinkingModes.includes('between-tools'),
        },
        sampling: {
          temperature: row.sampling,
          topP: row.sampling,
          topK: row.sampling,
          logprobs: false,
        },
        structuredOutput: { native: row.nativeStructuredOutput },
        compaction: row.compaction,
      },
    },
    providerOptions: {
      language: declareProviderOptions(
        anthropicProviderOptions.language,
        documentedSupport,
        {
          includePings: true,
          thinking: row.thinking !== false,
          effort: row.effort,
          speed: row.speed,
          taskBudget: row.taskBudget,
        },
      ),
    },
    requestConfig: {
      language: {
        maxOutputTokens: row.maxOutputTokens,
        knownModel: row.knownModel,
      },
    },
  };
}

/** Applies one default support value to every option, except the listed ones. */
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

/**
 * Generic rows for model IDs that are not in the matrix and match no listed
 * model family.
 */
const unknownClaudeModel: AnthropicLanguageModelRow = {
  documented: false,
  maxOutputTokens: 128000,
  knownModel: false,
  nativeStructuredOutput: true,
  thinking: {
    modes: ['adaptive', 'budget'],
    canBeDisabled: 'up-to-high-effort',
  },
  reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  sampling: onlyWithoutThinking,
  forcedToolUse: true,
  toolSearch: 'unknown',
  compaction: 'unknown',
  effort: 'unknown',
  speed: 'unknown',
  taskBudget: 'unknown',
};

/** Legacy Claude models (Claude Instant, 2, and 3) and non-Claude model IDs. */
const unknownLegacyModel: AnthropicLanguageModelRow = {
  documented: false,
  maxOutputTokens: 4096,
  knownModel: false,
  nativeStructuredOutput: false,
  thinking: { modes: ['budget'], canBeDisabled: 'always' },
  reasoningEfforts: undefined,
  sampling: true,
  forcedToolUse: true,
  toolSearch: 'unknown',
  compaction: 'unknown',
  effort: 'unknown',
  speed: 'unknown',
  taskBudget: 'unknown',
};

/**
 * Family rules, used only for model IDs that are not listed in the matrix,
 * such as provider-prefixed, regional, or versioned IDs. The first match
 * decides which listed row's request behavior the model ID uses.
 */
const unlistedModelFamilies: readonly {
  matches: (modelId: string) => boolean;
  row: AnthropicLanguageModelRow;
}[] = [
  {
    matches: modelId => modelId.includes('claude-sonnet-5-5'),
    row: languageModelDefinitions['claude-sonnet-5-5'],
  },
  {
    matches: modelId => modelId.includes('claude-opus-5-5'),
    row: languageModelDefinitions['claude-opus-5-5'],
  },
  {
    matches: modelId => modelId.includes('claude-haiku-5-5'),
    row: languageModelDefinitions['claude-haiku-5-5'],
  },
  {
    matches: modelId => modelId.includes('claude-opus-5'),
    row: languageModelDefinitions['claude-opus-5'],
  },
  {
    matches: modelId => modelId.includes('claude-fable-5-2'),
    row: languageModelDefinitions['claude-fable-5-2'],
  },
  {
    matches: modelId => modelId.includes('claude-fable-5-1'),
    row: languageModelDefinitions['claude-fable-5-1'],
  },
  {
    matches: modelId => modelId.includes('claude-fable-5'),
    row: languageModelDefinitions['claude-fable-5'],
  },
  {
    matches: modelId => modelId.includes('claude-opus-4-8'),
    row: languageModelDefinitions['claude-opus-4-8'],
  },
  {
    matches: modelId => modelId.includes('claude-opus-4-7'),
    row: languageModelDefinitions['claude-opus-4-7'],
  },
  {
    matches: modelId => modelId.includes('claude-sonnet-5'),
    row: languageModelDefinitions['claude-sonnet-5'],
  },
  {
    matches: modelId => modelId.includes('claude-sonnet-4-6'),
    row: languageModelDefinitions['claude-sonnet-4-6'],
  },
  {
    matches: modelId => modelId.includes('claude-opus-4-6'),
    row: languageModelDefinitions['claude-opus-4-6'],
  },
  {
    matches: modelId => modelId.includes('claude-sonnet-4-5'),
    row: languageModelDefinitions['claude-sonnet-4-5'],
  },
  {
    matches: modelId => modelId.includes('claude-opus-4-5'),
    row: languageModelDefinitions['claude-opus-4-5'],
  },
  {
    matches: modelId => modelId.includes('claude-haiku-4-5'),
    row: languageModelDefinitions['claude-haiku-4-5'],
  },
  {
    matches: modelId => modelId.includes('claude-opus-4-1'),
    row: languageModelDefinitions['claude-opus-4-1'],
  },
  {
    matches: modelId => /claude-sonnet-4(?:-|@)/.test(modelId),
    row: languageModelDefinitions['claude-sonnet-4-0'],
  },
  {
    matches: modelId => /claude-opus-4(?:-|@)/.test(modelId),
    row: languageModelDefinitions['claude-opus-4-0'],
  },
  {
    matches: modelId => modelId.includes('claude-3-haiku'),
    row: languageModelDefinitions['claude-3-haiku-20240307'],
  },
  {
    matches: modelId =>
      /claude-(?:instant(?:-|$)|v?2(?=$|[-.:])|3(?=$|[-.]))/.test(modelId),
    row: unknownLegacyModel,
  },
  {
    matches: modelId => modelId.includes('claude-'),
    row: unknownClaudeModel,
  },
];

/**
 * Resolves an unlisted model ID to a row. A family match keeps that family's
 * request behavior, but nothing is documented for the unlisted ID itself.
 */
function getUnlistedModelRow(modelId: string): AnthropicLanguageModelRow {
  const row =
    unlistedModelFamilies.find(family => family.matches(modelId))?.row ??
    unknownLegacyModel;

  return {
    ...row,
    documented: false,
    toolSearch: 'unknown',
    compaction: 'unknown',
    effort: 'unknown',
    speed: 'unknown',
    taskBudget: 'unknown',
  };
}

/** Compatibility projection for the provider's existing request preparation. */
export function getAnthropicModelCapabilities(modelId: string) {
  const {
    capabilities: { language },
    requestConfig: { language: requestConfig },
  } = getAnthropicLanguageModelEntry(modelId);

  return {
    maxOutputTokens: requestConfig.maxOutputTokens,
    supportsStructuredOutput: language.structuredOutput.native,
    supportsAdaptiveThinking: language.reasoning.adaptive,
    rejectsSamplingParameters: language.sampling.temperature !== true,
    supportsXhighEffort: language.reasoning.supportsXhighEffort,
    rejectsThinkingDisabledAboveHighEffort:
      !language.reasoning.canDisableAboveHighEffort,
    rejectsThinkingDisabled: !language.reasoning.canDisable,
    rejectsBudgetThinking: !language.reasoning.budget,
    rejectsForcedToolUse: !language.tools.forcedChoice,
    supportsBetweenToolsThinking: language.reasoning.betweenTools,
    isKnownModel: requestConfig.knownModel,
  };
}

// Compatibility name also exported by the Anthropic runtime adapter.
export { getAnthropicModelCapabilities as getModelCapabilities };

/** Known model IDs, derived from the declarations used to build the catalog. */
export type AnthropicModelIds = {
  language: keyof typeof languageModelDefinitions;
};
