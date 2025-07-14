import { AISDKError } from '@ai-sdk/provider';

/**
Error that is thrown when a model with an unsupported version is used.
 */
export class UnsupportedModelVersionError extends AISDKError {
  constructor() {
    super({
      name: 'AI_UnsupportedModelVersionError',
      message:
        `Unsupported model version. ` +
        `AI SDK 4 only supports models that implement specification version "v1". ` +
        `Please upgrade to AI SDK 5 to use this model.`,
    });
  }
}
