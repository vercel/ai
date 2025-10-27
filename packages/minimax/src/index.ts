// Anthropic-compatible API (Default)
export {
  createMinimaxAnthropic as createMinimax,
  minimaxAnthropic as minimax,
  minimaxAnthropic,
} from './minimax-anthropic-provider';

export type {
  MinimaxAnthropicProvider as MinimaxProvider,
  MinimaxAnthropicProviderSettings as MinimaxProviderSettings,
  MinimaxAnthropicProvider,
  MinimaxAnthropicProviderSettings,
} from './minimax-anthropic-provider';

// OpenAI-compatible API
export {
  createMinimax as createMinimaxOpenAI,
  minimaxOpenAI,
} from './minimax-openai-provider';

export type {
  MinimaxProvider as MinimaxOpenAIProvider,
  MinimaxProviderSettings as MinimaxOpenAIProviderSettings,
} from './minimax-openai-provider';

// Common exports
export type { OpenAICompatibleErrorData as MinimaxErrorData } from '@ai-sdk/openai-compatible';
export { VERSION } from './version';

