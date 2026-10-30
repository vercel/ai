import {
  defineModelCatalog,
  type LanguageModelCapabilities,
} from '@ai-sdk/provider-utils';

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Capabilities of a Claude model, used by the Messages API model and by
 * providers that serve Claude models.
 *
 * @see https://docs.claude.com/en/docs/about-claude/models/overview
 */
export type AnthropicLanguageModelCapabilities = LanguageModelCapabilities & {
  /**
   * Output token limit. Larger requests are limited to it for known models.
   * For unknown models, it is the default when no limit is set.
   */
  readonly maxOutputTokens: number;

  /**
   * Supports native structured outputs and strict tools.
   */
  readonly structuredOutput: boolean;

  /**
   * Accepts `temperature`, `topP`, and `topK`.
   */
  readonly samplingParameters: boolean;

  /**
   * Accepts `temperature` and `topP` in the same request.
   */
  readonly temperatureAndTopP: boolean;

  /**
   * Accepts a tool choice that forces tool use.
   */
  readonly forcedToolUse: boolean;

  readonly reasoning: {
    /**
     * Efforts of adaptive thinking, or `undefined` for models without
     * adaptive thinking.
     */
    readonly efforts?: readonly AnthropicEffort[];

    /**
     * Accepts budget-based thinking.
     */
    readonly budget: boolean;

    /**
     * Whether thinking can be disabled. `up-to-high-effort` means only with
     * an effort of `high` or lower.
     */
    readonly disabled: 'supported' | 'up-to-high-effort' | 'unsupported';

    /**
     * Supports `between_tools` thinking.
     */
    readonly betweenTools: boolean;
  };

  readonly tools: LanguageModelCapabilities['tools'] & {
    readonly computerUse: boolean;
    readonly webSearch: boolean;
    readonly toolSearch: boolean;
  };

  /**
   * Supports compaction.
   */
  readonly compaction: boolean;
};

const claude4: AnthropicLanguageModelCapabilities = {
  inputs: { image: true, audio: false },
  objectGeneration: true,
  tools: {
    usage: true,
    streaming: true,
    computerUse: true,
    webSearch: true,
    toolSearch: false,
  },
  compaction: false,
  maxOutputTokens: 32000,
  structuredOutput: false,
  samplingParameters: true,
  temperatureAndTopP: false,
  forcedToolUse: true,
  reasoning: { budget: true, disabled: 'supported', betweenTools: false },
};

const claude45: AnthropicLanguageModelCapabilities = {
  ...claude4,
  tools: { ...claude4.tools, toolSearch: true },
  maxOutputTokens: 64000,
  structuredOutput: true,
};

const claude46: AnthropicLanguageModelCapabilities = {
  ...claude45,
  compaction: true,
  maxOutputTokens: 128000,
  reasoning: {
    ...claude45.reasoning,
    efforts: ['low', 'medium', 'high', 'max'],
  },
};

const claude47: AnthropicLanguageModelCapabilities = {
  ...claude46,
  samplingParameters: false,
  reasoning: {
    ...claude46.reasoning,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
};

// Claude 5 models can only disable thinking at effort `high` or lower.
const claude5: AnthropicLanguageModelCapabilities = {
  ...claude47,
  reasoning: { ...claude47.reasoning, disabled: 'up-to-high-effort' },
};

// Models that always think adaptively.
const claude5AdaptiveOnly: AnthropicLanguageModelCapabilities = {
  ...claude5,
  reasoning: { ...claude5.reasoning, budget: false, disabled: 'unsupported' },
};

const claude3: AnthropicLanguageModelCapabilities = {
  ...claude4,
  maxOutputTokens: 4096,
};

// Unknown models, e.g. other models served through Anthropic-compatible APIs.
const unknownModel: AnthropicLanguageModelCapabilities = {
  ...claude3,
  temperatureAndTopP: true,
};

/**
 * Removes the parts of a model ID that hosts and snapshots add, e.g.
 * `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (Amazon Bedrock) or
 * `claude-sonnet-4-5@20250929` (Google Vertex AI) to `claude-sonnet-4-5`.
 */
function normalizeClaudeModelId(modelId: string): string {
  const claudeIndex = modelId.indexOf('claude-');
  return claudeIndex === -1
    ? modelId
    : modelId
        .slice(claudeIndex)
        .replace(/:\d+k$/, '')
        .replace(/-v\d+(?::\d+)?$/, '')
        .replace(/[-@]\d{8}$/, '');
}

// Claude 3, Claude 2, and Claude Instant models. Their limits are not tracked,
// so they are treated like unknown Claude models.
const legacyClaudeModelPattern =
  /claude-(?:instant(?:-|$)|v?2(?=$|[-.:])|3(?=$|[-.]))/;

export const anthropicLanguageModelCatalog =
  defineModelCatalog<AnthropicLanguageModelCapabilities>({
    normalize: normalizeClaudeModelId,
    entries: [
      // Documented models:
      {
        match: 'claude-opus-5-5',
        capabilities: { ...claude5AdaptiveOnly, forcedToolUse: false },
      },
      { match: 'claude-opus-5', capabilities: claude5 },
      {
        match: 'claude-sonnet-5-5',
        capabilities: {
          ...claude5AdaptiveOnly,
          forcedToolUse: false,
          reasoning: { ...claude5AdaptiveOnly.reasoning, betweenTools: true },
        },
      },
      { match: 'claude-sonnet-5', capabilities: claude47 },
      {
        match: 'claude-haiku-5-5',
        capabilities: {
          ...claude5,
          reasoning: { ...claude5.reasoning, budget: false },
        },
      },
      {
        match: 'claude-fable-5-1',
        capabilities: { ...claude5AdaptiveOnly, forcedToolUse: false },
      },
      { match: 'claude-fable-5', capabilities: claude5AdaptiveOnly },
      { match: ['claude-opus-4-8', 'claude-opus-4-7'], capabilities: claude47 },
      {
        match: ['claude-opus-4-6', 'claude-sonnet-4-6'],
        capabilities: claude46,
      },
      {
        match: ['claude-opus-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-5'],
        capabilities: claude45,
      },
      {
        match: 'claude-opus-4-1',
        capabilities: { ...claude4, structuredOutput: true },
      },
      { match: 'claude-opus-4-0', capabilities: claude4 },
      {
        match: 'claude-sonnet-4-0',
        capabilities: { ...claude4, maxOutputTokens: 64000 },
      },

      // Snapshots of documented models without a version suffix:
      { match: /^claude-opus-4$/, capabilities: claude4 },
      {
        match: /^claude-sonnet-4$/,
        capabilities: { ...claude4, maxOutputTokens: 64000 },
      },
      { match: /^claude-3-haiku(?:-|$)/, capabilities: claude3 },
    ],
    fallback: modelId =>
      legacyClaudeModelPattern.test(modelId)
        ? claude3
        : modelId.includes('claude-')
          ? // Unknown Claude models get the behavior of the newest models:
            claude5
          : unknownModel,
  });
