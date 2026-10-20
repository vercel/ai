import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { LanguageModelV4Citation } from './language-model-v4-citation';

/**
 * Text that the model has generated.
 */
export type LanguageModelV4Text = {
  type: 'text';

  /**
   * The text content.
   */
  text: string;

  /** References supporting this text, separate from retrieved sources. */
  citations?: Array<LanguageModelV4Citation>;

  providerMetadata?: SharedV4ProviderMetadata;
};
