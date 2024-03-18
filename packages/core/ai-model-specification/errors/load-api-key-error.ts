export class LoadAPIKeyError extends Error {
  constructor({ message }: { message: string }) {
    super(message);

    this.name = 'AI_LoadAPIKeyError';
  }

  static isLoadAPIKeyError(error: unknown): error is LoadAPIKeyError {
    return error instanceof Error && error.name === 'AI_LoadAPIKeyError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
