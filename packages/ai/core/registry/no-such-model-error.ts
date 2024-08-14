export class NoSuchModelError extends Error {
  readonly modelId: string;
  readonly modelType: string;

  constructor({
    modelId,
    modelType,
    message = `No such ${modelType}: ${modelId}`,
  }: {
    modelId: string;
    modelType: string;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_NoSuchModelError';

    this.modelId = modelId;
    this.modelType = modelType;
  }

  static isNoSuchModelError(error: unknown): error is NoSuchModelError {
    return (
      error instanceof Error &&
      error.name === 'AI_NoSuchModelError' &&
      typeof (error as NoSuchModelError).modelId === 'string' &&
      typeof (error as NoSuchModelError).modelType === 'string'
    );
  }

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
