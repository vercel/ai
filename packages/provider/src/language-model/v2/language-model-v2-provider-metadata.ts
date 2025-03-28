import { JSONValue } from '../../json-value/json-value';

/**
 * Additional provider-specific metadata. They are returned from
 * the provider and enable provider-specific result information.
 *
 * This enables us to quickly ship provider-specific functionality
 * without affecting the core AI SDK.
 *
 * The outer record is keyed by the provider name, and the inner
 * record is keyed by the provider-specific metadata key.
 *
 * ```ts
 * {
 *   "anthropic": {
 *     "cacheControl": { "type": "ephemeral" }
 *   }
 * }
 * ```
 */
export type LanguageModelV2ProviderMetadata = Record<
  string,
  Record<string, JSONValue>
>;
