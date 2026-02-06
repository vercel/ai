/**
 * Shared types for AI SDK compatibility.
 */
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';

/**
 * Compatible language model type using V3 specifications.
 *
 * This package uses the LanguageModelV3 interface from @ai-sdk/provider.
 */
export type CompatibleLanguageModel = LanguageModelV3;

/**
 * Type alias for call options.
 */
export type CompatibleCallOptions = LanguageModelV3CallOptions;

/**
 * Type alias for stream parts.
 */
export type CompatibleStreamPart = LanguageModelV3StreamPart;
