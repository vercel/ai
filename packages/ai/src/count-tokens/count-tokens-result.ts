import { SharedV3ProviderMetadata, SharedV3Warning } from '@ai-sdk/provider';

export interface CountTokensResult {
  /**
   * The total number of tokens in the prompt.
   */
  readonly tokens: number;

  /**
   * Warnings from the model provider (e.g. unsupported settings).
   */
  readonly warnings: SharedV3Warning[];

  /**
   * Optional metadata from the provider.
   */
  readonly providerMetadata?: SharedV3ProviderMetadata;

  /**
   * Optional response data.
   */
  readonly response?: {
    headers?: Record<string, string>;
    body?: unknown;
  };
}
