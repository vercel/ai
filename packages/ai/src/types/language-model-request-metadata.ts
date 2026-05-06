import type { ModelMessage } from '@ai-sdk/provider-utils';

export type LanguageModelRequestMetadata = {
  /**
   * The input messages that were sent to the model for this step.
   */
  messages?: Array<ModelMessage>;

  /**
   * Request HTTP body that was sent to the provider API.
   */
  body?: unknown;
};
