import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_NoSuchModelError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export type ModelType = 'languageModel' | 'textEmbeddingModel';

export class NoSuchModelError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly modelId: string;
  readonly modelType: ModelType;

  constructor({
    modelId,
    modelType,
    message = `No such ${modelType}: ${modelId}`,
  }: {
    modelId: string;
    modelType: ModelType;
    message?: string;
  }) {
    super({ name, message });

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
