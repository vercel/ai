import { JSONValue } from '../../json-value/json-value';

/**
 * Additional provider-specific metadata. They are passed through
 * to the provider from the AI SDK and enable provider-specific
 * functionality that can be fully encapsulated in the provider.
 *
 * This enables us to quickly ship provider-specific functionality
 * without affecting the core AI SDK.
 */
export type LanguageModelV1ProviderMetadata = Record<string, JSONValue>;
