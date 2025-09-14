import { SharedV2ProviderOptions } from '@ai-sdk/provider';

export interface RegisterProviderOptions {}

/**
Additional provider-specific options.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
export type ProviderOptions = RegisterProviderOptions & SharedV2ProviderOptions;
