import { defineModelCapabilities } from '@ai-sdk/provider-utils';

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Efforts in ascending order.
 */
export const anthropicEfforts: readonly AnthropicEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/**
 * Capabilities of a Claude model that are used for defaults and feature
 * selection.
 *
 * @see https://docs.claude.com/en/docs/about-claude/models/overview#model-comparison-table
 * @see https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */
export type AnthropicLanguageModelCapabilities = {
  /**
   * Maximum number of output tokens. Used as the default `max_tokens`.
   */
  maxOutputTokens: number;

  /**
   * Supports native structured outputs (`output_config.format`) and strict
   * tools.
   */
  structuredOutput: boolean;

  /**
   * Accepts `temperature`, `top_p`, and `top_k`.
   */
  samplingParameters: boolean;

  /**
   * Accepts forced tool use (`tool_choice` `any` or a named tool).
   */
  forcedToolUse: boolean;

  /**
   * Supported thinking modes. The API rejects modes that are not listed.
   */
  thinking: {
    /**
     * Adaptive thinking (`thinking.type` `adaptive`), with the efforts that
     * top-level `reasoning` can map to.
     */
    adaptive?: { efforts: readonly AnthropicEffort[] };

    /**
     * Budget-based thinking (`thinking.type` `enabled` with `budget_tokens`).
     */
    budget?: true;

    /**
     * Disabled thinking (`thinking.type` `disabled`). `maxEffort` is the
     * highest effort that is accepted while thinking is disabled.
     */
    disabled?: { maxEffort?: AnthropicEffort };

    /**
     * `thinking.type` `between_tools`, the lowest thinking setting on models
     * that reject disabled thinking.
     */
    betweenTools?: true;
  };
};

const claude5: AnthropicLanguageModelCapabilities = {
  maxOutputTokens: 128000,
  structuredOutput: true,
  samplingParameters: false,
  forcedToolUse: true,
  thinking: {
    adaptive: { efforts: anthropicEfforts },
    budget: true,
    disabled: { maxEffort: 'high' },
  },
};

const claude4: AnthropicLanguageModelCapabilities = {
  maxOutputTokens: 64000,
  structuredOutput: true,
  samplingParameters: true,
  forcedToolUse: true,
  thinking: { budget: true, disabled: {} },
};

const legacyClaude: AnthropicLanguageModelCapabilities = {
  maxOutputTokens: 4096,
  structuredOutput: false,
  samplingParameters: true,
  forcedToolUse: true,
  thinking: { budget: true, disabled: {} },
};

const legacyClaudeModelIdPattern =
  /claude-(?:instant(?:-|$)|v?2(?=$|[-.:])|3(?=$|[-.]))/;

/**
 * Extracts the Claude model name from Anthropic model IDs and from the model
 * IDs of platforms that serve Claude models, e.g.
 * - `claude-sonnet-4-5-20250929`
 * - `claude-sonnet-4-5@20250929` (Google Vertex AI)
 * - `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (Amazon Bedrock)
 */
export function normalizeClaudeModelId(modelId: string): string {
  const claudeIndex = modelId.indexOf('claude-');

  if (claudeIndex === -1) {
    return modelId;
  }

  return (
    modelId
      .slice(claudeIndex)
      // Amazon Bedrock version, e.g. `-v1:0`, except in `claude-v2`:
      .replace(/(?<!^claude)-v\d+(?::.*)?$/, '')
      // Snapshot date:
      .replace(/[-@]\d{8}$/, '')
  );
}

export const anthropicLanguageModelCapabilities =
  defineModelCapabilities<AnthropicLanguageModelCapabilities>({
    normalize: normalizeClaudeModelId,
    entries: [
      {
        match: 'claude-sonnet-5-5',
        capabilities: {
          ...claude5,
          forcedToolUse: false,
          thinking: { adaptive: claude5.thinking.adaptive, betweenTools: true },
        },
      },
      {
        match: 'claude-opus-5-5',
        capabilities: {
          ...claude5,
          forcedToolUse: false,
          thinking: { adaptive: claude5.thinking.adaptive },
        },
      },
      {
        match: 'claude-haiku-5-5',
        capabilities: {
          ...claude5,
          thinking: {
            adaptive: claude5.thinking.adaptive,
            disabled: { maxEffort: 'high' },
          },
        },
      },
      { match: 'claude-opus-5', capabilities: claude5 },
      {
        match: 'claude-fable-5-1',
        capabilities: {
          ...claude5,
          forcedToolUse: false,
          thinking: { adaptive: claude5.thinking.adaptive },
        },
      },
      {
        match: 'claude-fable-5',
        capabilities: {
          ...claude5,
          thinking: { adaptive: claude5.thinking.adaptive },
        },
      },
      {
        match: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5'],
        capabilities: {
          ...claude5,
          thinking: { ...claude5.thinking, disabled: {} },
        },
      },
      {
        match: ['claude-sonnet-4-6', 'claude-opus-4-6'],
        capabilities: {
          ...claude4,
          maxOutputTokens: 128000,
          thinking: {
            ...claude4.thinking,
            adaptive: { efforts: ['low', 'medium', 'high', 'max'] },
          },
        },
      },
      {
        match: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
        capabilities: claude4,
      },
      {
        match: 'claude-opus-4-1',
        capabilities: { ...claude4, maxOutputTokens: 32000 },
      },
      {
        match: ['claude-sonnet-4', 'claude-sonnet-4-0'],
        capabilities: { ...claude4, structuredOutput: false },
      },
      {
        match: ['claude-opus-4', 'claude-opus-4-0'],
        capabilities: {
          ...claude4,
          maxOutputTokens: 32000,
          structuredOutput: false,
        },
      },
      { match: 'claude-3-haiku', capabilities: legacyClaude },
    ],
    fallback: modelId =>
      // Known and legacy Claude families are handled above, so any remaining
      // Claude ID is assumed to be newer than the known list. Non-Claude
      // models (e.g. served through Anthropic-compatible APIs) keep
      // conservative defaults.
      modelId.includes('claude-') && !legacyClaudeModelIdPattern.test(modelId)
        ? claude5
        : legacyClaude,
  });
