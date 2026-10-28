import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
} from '@ai-sdk/provider';

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
  requestConfig: { language: AnthropicLanguageRequestConfig };
};

type RuntimeDefinition = {
  maxOutputTokens: number;
  nativeStructuredOutput: boolean;
  adaptiveThinking: boolean;
  samplingParameters: boolean;
  xhighEffort: boolean;
  thinkingCanBeDisabledAboveHighEffort: boolean;
  thinkingCanBeDisabled: boolean;
  budgetThinking: boolean;
  forcedToolUse: boolean;
  betweenToolsThinking: boolean;
  knownModel: boolean;
};

type DocumentedCapabilities = {
  toolSearch: boolean;
  compaction: boolean;
};

const legacyClaude = defineRuntime({});
const currentClaude = defineRuntime({
  maxOutputTokens: 128000,
  nativeStructuredOutput: true,
  adaptiveThinking: true,
});
const currentClaudeWithoutSampling = defineRuntime({
  ...currentClaude,
  samplingParameters: false,
  xhighEffort: true,
});

function defineRuntime(
  overrides: Partial<RuntimeDefinition>,
): RuntimeDefinition {
  return {
    maxOutputTokens: 4096,
    nativeStructuredOutput: false,
    adaptiveThinking: false,
    samplingParameters: true,
    xhighEffort: false,
    thinkingCanBeDisabledAboveHighEffort: true,
    thinkingCanBeDisabled: true,
    budgetThinking: true,
    forcedToolUse: true,
    betweenToolsThinking: false,
    knownModel: true,
    ...overrides,
  };
}

const runtimeRules: readonly {
  matches: (modelId: string) => boolean;
  definition: RuntimeDefinition;
}[] = [
  {
    matches: modelId => modelId.includes('claude-sonnet-5-5'),
    definition: defineRuntime({
      ...currentClaudeWithoutSampling,
      thinkingCanBeDisabledAboveHighEffort: false,
      thinkingCanBeDisabled: false,
      budgetThinking: false,
      forcedToolUse: false,
      betweenToolsThinking: true,
    }),
  },
  {
    matches: modelId => modelId.includes('claude-opus-5-5'),
    definition: defineRuntime({
      ...currentClaudeWithoutSampling,
      thinkingCanBeDisabledAboveHighEffort: false,
      thinkingCanBeDisabled: false,
      budgetThinking: false,
      forcedToolUse: false,
    }),
  },
  {
    matches: modelId => modelId.includes('claude-haiku-5-5'),
    definition: defineRuntime({
      ...currentClaudeWithoutSampling,
      thinkingCanBeDisabledAboveHighEffort: false,
      budgetThinking: false,
    }),
  },
  {
    matches: modelId => modelId.includes('claude-opus-5'),
    definition: defineRuntime({
      ...currentClaudeWithoutSampling,
      thinkingCanBeDisabledAboveHighEffort: false,
    }),
  },
  {
    matches: modelId => modelId.includes('claude-fable-5-1'),
    definition: defineRuntime({
      ...currentClaudeWithoutSampling,
      thinkingCanBeDisabled: false,
      budgetThinking: false,
      forcedToolUse: false,
    }),
  },
  {
    matches: modelId => modelId.includes('claude-fable-5'),
    definition: defineRuntime({
      ...currentClaudeWithoutSampling,
      thinkingCanBeDisabled: false,
      budgetThinking: false,
    }),
  },
  {
    matches: modelId =>
      modelId.includes('claude-opus-4-8') ||
      modelId.includes('claude-opus-4-7') ||
      modelId.includes('claude-sonnet-5'),
    definition: currentClaudeWithoutSampling,
  },
  {
    matches: modelId =>
      modelId.includes('claude-sonnet-4-6') ||
      modelId.includes('claude-opus-4-6'),
    definition: currentClaude,
  },
  {
    matches: modelId =>
      modelId.includes('claude-sonnet-4-5') ||
      modelId.includes('claude-opus-4-5') ||
      modelId.includes('claude-haiku-4-5'),
    definition: defineRuntime({
      maxOutputTokens: 64000,
      nativeStructuredOutput: true,
    }),
  },
  {
    matches: modelId => modelId.includes('claude-opus-4-1'),
    definition: defineRuntime({
      maxOutputTokens: 32000,
      nativeStructuredOutput: true,
    }),
  },
  {
    matches: modelId => /claude-sonnet-4(?:-|@)/.test(modelId),
    definition: defineRuntime({ maxOutputTokens: 64000 }),
  },
  {
    matches: modelId => /claude-opus-4(?:-|@)/.test(modelId),
    definition: defineRuntime({ maxOutputTokens: 32000 }),
  },
  {
    matches: modelId => modelId.includes('claude-3-haiku'),
    definition: legacyClaude,
  },
  {
    matches: modelId =>
      /claude-(?:instant(?:-|$)|v?2(?=$|[-.:])|3(?=$|[-.]))/.test(modelId),
    definition: defineRuntime({ knownModel: false }),
  },
];

const documentedModels: Readonly<Record<string, DocumentedCapabilities>> = {
  'claude-opus-5-5': { toolSearch: true, compaction: true },
  'claude-opus-5': { toolSearch: true, compaction: true },
  'claude-sonnet-5-5': { toolSearch: true, compaction: true },
  'claude-sonnet-5': { toolSearch: true, compaction: true },
  'claude-haiku-5-5': { toolSearch: true, compaction: true },
  'claude-fable-5-1': { toolSearch: true, compaction: true },
  'claude-fable-5': { toolSearch: true, compaction: true },
  'claude-opus-4-8': { toolSearch: true, compaction: true },
  'claude-opus-4-7': { toolSearch: true, compaction: true },
  'claude-opus-4-6': { toolSearch: true, compaction: true },
  'claude-sonnet-4-6': { toolSearch: true, compaction: true },
  'claude-opus-4-5': { toolSearch: true, compaction: false },
  'claude-haiku-4-5': { toolSearch: true, compaction: false },
  'claude-sonnet-4-5': { toolSearch: true, compaction: false },
  'claude-opus-4-1': { toolSearch: false, compaction: false },
  'claude-opus-4-0': { toolSearch: false, compaction: false },
  'claude-sonnet-4-0': { toolSearch: false, compaction: false },
};

export const anthropicModelCatalog: Readonly<
  Record<string, AnthropicLanguageModelEntry>
> = Object.fromEntries(
  Object.entries(documentedModels).map(([modelId, capabilities]) => [
    modelId,
    createAnthropicLanguageModelEntry(modelId, capabilities),
  ]),
);

export function getAnthropicLanguageModelEntry(
  modelId: string,
): AnthropicLanguageModelEntry {
  return Object.prototype.hasOwnProperty.call(anthropicModelCatalog, modelId)
    ? anthropicModelCatalog[modelId]
    : createAnthropicLanguageModelEntry(modelId);
}

function createAnthropicLanguageModelEntry(
  modelId: string,
  documented?: DocumentedCapabilities,
): AnthropicLanguageModelEntry {
  const runtime = resolveRuntimeDefinition(modelId);
  const declared = documented != null;
  const samplingSupport = runtime.samplingParameters
    ? true
    : { condition: 'Only supported when thinking is disabled.' };

  return {
    capabilities: {
      language: {
        inputs: {
          image: declared ? true : 'unknown',
          audio: declared ? false : 'unknown',
        },
        objectGeneration: declared ? true : 'unknown',
        tools: {
          usage: declared ? true : 'unknown',
          streaming: declared ? true : 'unknown',
          forcedChoice: runtime.forcedToolUse,
          computerUse: declared ? true : 'unknown',
          webSearch: declared ? true : 'unknown',
          toolSearch: documented?.toolSearch ?? 'unknown',
        },
        reasoning: {
          support: runtime.adaptiveThinking || runtime.budgetThinking,
          efforts: runtime.xhighEffort
            ? ['low', 'medium', 'high', 'xhigh', 'max']
            : undefined,
          adaptive: runtime.adaptiveThinking,
          budget: runtime.budgetThinking,
          canDisable: runtime.thinkingCanBeDisabled,
          canDisableAboveHighEffort:
            runtime.thinkingCanBeDisabledAboveHighEffort,
          supportsXhighEffort: runtime.xhighEffort,
          betweenTools: runtime.betweenToolsThinking,
        },
        sampling: {
          temperature: samplingSupport,
          topP: samplingSupport,
          topK: samplingSupport,
          logprobs: false,
        },
        structuredOutput: { native: runtime.nativeStructuredOutput },
        compaction: documented?.compaction ?? 'unknown',
      },
    },
    requestConfig: {
      language: {
        maxOutputTokens: runtime.maxOutputTokens,
        knownModel: runtime.knownModel,
      },
    },
  };
}

function resolveRuntimeDefinition(modelId: string): RuntimeDefinition {
  const rule = runtimeRules.find(rule => rule.matches(modelId));
  if (rule != null) return rule.definition;

  return modelId.includes('claude-')
    ? defineRuntime({
        ...currentClaudeWithoutSampling,
        thinkingCanBeDisabledAboveHighEffort: false,
        knownModel: false,
      })
    : defineRuntime({ knownModel: false });
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
