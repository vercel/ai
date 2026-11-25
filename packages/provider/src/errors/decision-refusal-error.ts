import { AISDKError } from './ai-sdk-error';

const name = 'AI_DecisionRefusalError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * A decision model declined to answer one or more questions.
 */
export class DecisionRefusalError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly questionIds: string[];
  readonly provider: string;
  readonly modelId: string;

  constructor({
    questionIds,
    provider,
    modelId,
    message = `Decision model "${modelId}" from provider "${provider}" refused ${questionIds.length === 1 ? 'question' : 'questions'} ${questionIds.map(id => JSON.stringify(id)).join(', ')}.`,
  }: {
    questionIds: string[];
    provider: string;
    modelId: string;
    message?: string;
  }) {
    super({ name, message });

    this.questionIds = questionIds;
    this.provider = provider;
    this.modelId = modelId;
  }

  static isInstance(error: unknown): error is DecisionRefusalError {
    return AISDKError.hasMarker(error, marker);
  }
}
