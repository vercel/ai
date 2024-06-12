export class NoSuchModelError extends Error {
  readonly modelId: string;

  constructor({
    modelId,
    message = `No such model: ${modelId}`,
  }: {
    modelId: string;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_NoSuchModelError';

    this.modelId = modelId;
  }

  static isNoSuchModelError(error: unknown): error is NoSuchModelError {
    return (
      error instanceof Error &&
      error.name === 'AI_NoSuchModelError' &&
      typeof (error as NoSuchModelError).modelId === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      modelId: this.modelId,
    };
  }
}
