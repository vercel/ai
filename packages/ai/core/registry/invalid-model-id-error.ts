export class InvalidModelIdError extends Error {
  readonly id: string;

  constructor({
    id,
    message = `Invalid model id: ${id}`,
  }: {
    id: string;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_InvalidModelIdError';

    this.id = id;
  }

  static isInvalidModelIdError(error: unknown): error is InvalidModelIdError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidModelIdError' &&
      typeof (error as InvalidModelIdError).id === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      id: this.id,
    };
  }
}
