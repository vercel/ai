export class LoadAPIKeyAIError extends Error {
  constructor({ message }: { message: string }) {
    super(message);

    this.name = 'LoadAPIKeyAIError';
  }

  static isLoadAPIKeyAIError(error: unknown): error is LoadAPIKeyAIError {
    return error instanceof Error && error.name === 'LoadAPIKeyAIError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
