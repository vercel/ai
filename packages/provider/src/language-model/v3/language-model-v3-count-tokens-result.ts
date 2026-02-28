import { SharedV3Headers } from '../../shared/v3/shared-v3-headers';
import { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';
import { SharedV3Warning } from '../../shared/v3/shared-v3-warning';

/**
 * Result of counting tokens in a prompt.
 */
export type LanguageModelV3CountTokensResult = {
  /**
   * The total number of tokens in the prompt.
   */
  tokens: number;

  /**
   * Optional metadata from the provider.
   */
  providerMetadata?: SharedV3ProviderMetadata;

  /**
   * The request that was sent to the provider.
   */
  request?: { body?: unknown };

  /**
   * The response from the provider.
   */
  response?: { headers?: SharedV3Headers; body?: unknown };

  /**
   * Warnings from the model provider (e.g. unsupported settings).
   */
  warnings: Array<SharedV3Warning>;
};
