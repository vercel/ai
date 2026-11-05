/**
 * Claude Platform on AWS uses Anthropic model IDs, request policies, and the
 * providerOptions.anthropic namespace. Keep one authoritative catalog for both
 * transports; AWS authentication and workspace settings are provider settings.
 */
export {
  anthropicModelCatalog as anthropicAwsModelCatalog,
  anthropicProviderOptions as anthropicAwsProviderOptions,
  getAnthropicLanguageModelEntry as getAnthropicAwsLanguageModelEntry,
} from '@ai-sdk/anthropic/internal';
