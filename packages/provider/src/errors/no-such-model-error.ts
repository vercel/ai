import { AISDKError } from './ai-sdk-error';

const name = 'AI_NoSuchModelError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class NoSuchModelError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly modelId: string;
  readonly modelType: 'languageModel' | 'textEmbeddingModel';

  constructor({
    errorName = name,
    modelId,
    modelType,
    message = `No such ${modelType}: ${modelId}`,
  }: {
    errorName?: string;
    modelId: string;
    modelType: 'languageModel' | 'textEmbeddingModel';
    message?: string;
  }) {
    super({ name: errorName, message });

    this.modelId = modelId;
    this.modelType = modelType;
  }

  static isInstance(error: unknown): error is NoSuchModelError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isNoSuchModelError(error: unknown): error is NoSuchModelError {
    return (
      error instanceof Error &&
      error.name === name &&
      typeof (error as NoSuchModelError).modelId === 'string' &&
      typeof (error as NoSuchModelError).modelType === 'string'
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      modelId: this.modelId,
      modelType: this.modelType,
    };
  }
}
