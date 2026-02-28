import type { FetchFunction, Resolvable } from '@ai-sdk/provider-utils';

export interface AzureAIFoundryConfig {
  baseURL: string;
  anthropicVersion: string;
  // OpenAI internal classes accept synchronous headers
  getOpenAIHeaders: () => Record<string, string | undefined>;
  // Anthropic internal classes accept Resolvable<> — async functions work natively
  // Uses the SDK's standard Resolvable<T> type (= T | PromiseLike<T> | () => T | PromiseLike<T>)
  // matching the pattern at google-vertex-anthropic-provider.ts:128
  getAnthropicHeaders: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}
