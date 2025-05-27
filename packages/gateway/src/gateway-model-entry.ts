import type { LanguageModelV2 } from '@ai-sdk/provider';

export interface GatewayLanguageModelEntry {
  /**
   * The model id used by the remote provider in model settings and for specifying the
   * intended model for text generation.
   */
  id: string;

  /**
   * The display name of the model for presentation in user-facing contexts.
   */
  name: string;

  /**
   * Additional AI SDK language model specifications for the model.
   */
  specification: GatewayLanguageModelSpecification;
}

export type GatewayLanguageModelSpecification = Pick<
  LanguageModelV2,
  'specificationVersion' | 'provider' | 'modelId'
>;
