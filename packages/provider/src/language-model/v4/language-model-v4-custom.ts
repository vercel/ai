import { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';

/**
 * A provider-specific content block that does not map to another standardized
 * content part type.
 */
export type LanguageModelV4Custom = {
  type: 'custom';
  providerMetadata?: SharedV3ProviderMetadata;
};
