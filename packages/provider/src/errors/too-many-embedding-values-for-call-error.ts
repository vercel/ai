export class TooManyEmbeddingValuesForCallError extends Error {
  readonly provider: string;
  readonly modelId: string;
  readonly maxEmbeddingsPerCall: number;
  readonly values: Array<unknown>;

  constructor(options: {
    provider: string;
    modelId: string;
    maxEmbeddingsPerCall: number;
    values: Array<unknown>;
  }) {
    super(
      `Too many values for a single embedding call. ` +
        `The ${options.provider} model "${options.modelId}" can only embed up to ` +
        `${options.maxEmbeddingsPerCall} values per call, but ${options.values.length} values were provided.`,
    );

    this.name = 'AI_TooManyEmbeddingValuesForCallError';

    this.provider = options.provider;
    this.modelId = options.modelId;
    this.maxEmbeddingsPerCall = options.maxEmbeddingsPerCall;
    this.values = options.values;
  }

  static isInvalidPromptError(
    error: unknown,
  ): error is TooManyEmbeddingValuesForCallError {
    return (
      error instanceof Error &&
      error.name === 'AI_TooManyEmbeddingValuesForCallError' &&
      'provider' in error &&
      typeof error.provider === 'string' &&
      'modelId' in error &&
      typeof error.modelId === 'string' &&
      'maxEmbeddingsPerCall' in error &&
      typeof error.maxEmbeddingsPerCall === 'number' &&
      'values' in error &&
      Array.isArray(error.values)
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      provider: this.provider,
      modelId: this.modelId,
      maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
      values: this.values,
    };
  }
}
