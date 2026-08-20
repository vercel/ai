import type { OpenAICompatibleLanguageModelChatOptions } from '@ai-sdk/openai-compatible';

export type { CerebrasChatModelId } from './cerebras-chat-options';

export type CerebrasLanguageModelChatOptions = Omit<
  OpenAICompatibleLanguageModelChatOptions,
  'reasoningEffort'
> & {
  /** Exact Cerebras output limit, including reasoning tokens. */
  max_completion_tokens?: number;

  /** Whether to allow parallel function calls. */
  parallel_tool_calls?: boolean;

  /** Whether to return output-token log probabilities. */
  logprobs?: boolean;

  /** Number of most likely tokens to return at each position. */
  top_logprobs?: number;

  /** Token-ID to logit-bias mapping. */
  logit_bias?: Record<string, number>;

  /** Cerebras service tier for the request. */
  service_tier?: 'auto' | 'default' | 'flex' | 'priority';

  /** Reasoning effort, including disabling optional reasoning. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';

  /** Format used to return reasoning content. */
  reasoning_format?: 'none' | 'parsed' | 'text_parsed' | 'raw' | 'hidden';

  /** A predicted output used to accelerate regeneration workloads. */
  prediction?: Record<string, unknown>;

  /** Stable identifier for prompt-cache routing. */
  prompt_cache_key?: string;
};
