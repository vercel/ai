import { AISDKError } from './ai-sdk-error';

const name = 'AI_TooManyDocumentsForRerankingError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class TooManyDocumentsForRerankingError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly provider: string;
  readonly modelId: string;
  readonly maxDocumentsPerCall: number;
  readonly documents: Array<unknown>;

  constructor(options: {
    provider: string;
    modelId: string;
    maxDocumentsPerCall: number;
    documents: Array<unknown>;
  }) {
    super({
      name,
      message:
        `Too many documents for a single reranking call. ` +
        `The ${options.provider} model "${options.modelId}" can only rerank up to ` +
        `${options.maxDocumentsPerCall} documents per call, but ${options.documents.length} documents were provided.`,
    });

    this.provider = options.provider;
    this.modelId = options.modelId;
    this.maxDocumentsPerCall = options.maxDocumentsPerCall;
    this.documents = options.documents;
  }

  static isInstance(
    error: unknown,
  ): error is TooManyDocumentsForRerankingError {
    return AISDKError.hasMarker(error, marker);
  }
}
