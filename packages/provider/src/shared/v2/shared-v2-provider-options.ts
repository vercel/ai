import { JSONValue } from '../../json-value/json-value';

/**
 * Additional provider-specific options.
 * Options are additional input to the provider.
 * They are passed through to the provider from the AI SDK
 * and enable provider-specific functionality
 * that can be fully encapsulated in the provider.
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
export interface SharedV2ProviderOptions {
  [providerName: string]: Record<string, JSONValue>;
}

/**
 * Provider-specific options for embedding models.
 */
export interface SharedV2EmbedProviderOptions {
  [providerName: string]: Record<string, JSONValue>;
}

/**
 * Provider-specific options for image generation models.
 */
export interface SharedV2ImageProviderOptions {
  [providerName: string]: Record<string, JSONValue>;
}

/**
 * Provider-specific options for speech generation models.
 */
export interface SharedV2SpeechProviderOptions {
  [providerName: string]: Record<string, JSONValue>;
}

/**
 * Provider-specific options for transcription models.
 */
export interface SharedV2TranscribeProviderOptions {
  [providerName: string]: Record<string, JSONValue>;
}
