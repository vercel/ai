export class InvalidPromptAIError extends Error {
  readonly prompt: unknown;

  constructor({
    prompt,
    message = `Invalid prompt: ${prompt}`,
  }: {
    prompt: unknown;
    message: string;
  }) {
    super(message);

    this.name = 'InvalidPromptAIError';

    this.prompt = prompt;
  }

  static isInvalidPromptAIError(error: unknown): error is InvalidPromptAIError {
    return (
      error instanceof Error &&
      error.name === 'InvalidPromptAIError' &&
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
