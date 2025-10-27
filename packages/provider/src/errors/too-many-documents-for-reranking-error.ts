import { AISDKError } from './ai-sdk-error';

const name = 'AI_TooManyDocumentsForRerankingError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class TooManyDocumentsForRerankingError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly provider: string;
  readonly modelId: string;
  readonly maxDocumentsPerCall: number;
  readonly documentsCount: number;

  constructor(options: {
    provider: string;
    modelId: string;
    maxDocumentsPerCall: number;
    documentsCount: number;
  }) {
    super({
      name,
      message:
        `Too many documents for a single reranking call. ` +
        `The ${options.provider} model "${options.modelId}" can only rerank up to ` +
        `${options.maxDocumentsPerCall} documents per call, but ${options.documentsCount} documents were provided.`,
    });

    this.provider = options.provider;
    this.modelId = options.modelId;
    this.maxDocumentsPerCall = options.maxDocumentsPerCall;
    this.documentsCount = options.documentsCount;
  }

  static isInstance(
    error: unknown,
  ): error is TooManyDocumentsForRerankingError {
    return AISDKError.hasMarker(error, marker);
  }
}
