export class InvalidPromptError extends Error {
  readonly prompt: unknown;

  constructor({ prompt, message }: { prompt: unknown; message: string }) {
    super(`Invalid prompt: ${message}`);

    this.name = 'AI_InvalidPromptError';

    this.prompt = prompt;
  }

  static isInvalidPromptError(error: unknown): error is InvalidPromptError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidPromptError' &&
      prompt != null
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      prompt: this.prompt,
    };
  }
}
