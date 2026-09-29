import { AISDKError } from './ai-sdk-error';

const name = 'AI_EvaluationUnsupportedQuestionTypeError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * An evaluation model does not support the type of a requested question.
 */
export class EvaluationUnsupportedQuestionTypeError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly questionId: string;
  readonly questionType: string;
  readonly provider: string;
  readonly modelId: string;

  constructor({
    questionId,
    questionType,
    provider,
    modelId,
    message = `Question "${questionId}" has type "${questionType}", which is not supported by provider "${provider}" and model "${modelId}".`,
  }: {
    questionId: string;
    questionType: string;
    provider: string;
    modelId: string;
    message?: string;
  }) {
    super({ name, message });

    this.questionId = questionId;
    this.questionType = questionType;
    this.provider = provider;
    this.modelId = modelId;
  }

  static isInstance(
    error: unknown,
  ): error is EvaluationUnsupportedQuestionTypeError {
    return AISDKError.hasMarker(error, marker);
  }
}
