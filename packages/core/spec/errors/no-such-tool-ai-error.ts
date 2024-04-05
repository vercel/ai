export class NoSuchToolAIError extends Error {
  readonly toolName: string;
  readonly availableTools: string[] | undefined;

  constructor({
    toolName,
    availableTools = undefined,
    message = `Model tried to call unavailable tool '${toolName}'. ${
      availableTools === undefined
        ? 'No tools are available.'
        : `Available tools: ${availableTools.join(', ')}.`
    }`,
  }: {
    toolName: string;
    availableTools?: string[] | undefined;
    message?: string;
  }) {
    super(message);

    this.name = 'NoSuchToolAIError';

    this.toolName = toolName;
    this.availableTools = availableTools;
  }

  static isNoSuchToolAIError(error: unknown): error is NoSuchToolAIError {
    return (
      error instanceof Error &&
      error.name === 'NoSuchToolAIError' &&
      'toolName' in error &&
      error.toolName != undefined &&
      typeof error.name === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      toolName: this.toolName,
      availableTools: this.availableTools,
    };
  }
}
