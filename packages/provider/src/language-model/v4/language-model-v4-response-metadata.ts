import type { LanguageModelV4Usage } from './language-model-v4-usage';

export interface LanguageModelV4ResponseMetadata {
  /**
   * ID for the generated response, if the provider sends one.
   */
  id?: string;

  /**
   * Timestamp for the start of the generated response, if the provider sends one.
   */
  timestamp?: Date;

  /**
   * The ID of the response model that was used to generate the response, if the provider sends one.
   */
  modelId?: string;

  /**
   * Usage information that is available when the response starts.
   *
   * This can be partial or preliminary. The usage in the finish stream part contains
   * the final usage for the response.
   */
  usage?: LanguageModelV4Usage;
}
