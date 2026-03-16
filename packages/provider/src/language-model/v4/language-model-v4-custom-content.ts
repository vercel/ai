import { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';

/**
 * A provider-specific content block that does not map to another standardized
 * content part type.
 */
export type LanguageModelV4CustomContent = {
  type: 'custom-content';
  provider?: string;
  providerMetadata?: SharedV4ProviderMetadata;
};
