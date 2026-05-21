import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

/**
 * Prompt shape passed to `HarnessV1Session.doPrompt`.
 *
 * Aliases `LanguageModelV4Prompt` from `@ai-sdk/provider` — harness adapters
 * receive the same structured message-array shape that V4 language models
 * receive. Defining it under a harness-owned name keeps the spec self-
 * contained and gives us room to extend later if a harness-specific prompt
 * shape becomes necessary.
 */
export type HarnessV1Prompt = LanguageModelV4Prompt;
