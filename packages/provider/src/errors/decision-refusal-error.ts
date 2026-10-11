import { AISDKError } from './ai-sdk-error';
import type {
  DecisionModelV4Answer,
  DecisionModelV4Result,
} from '../decision-model/v4/decision-model-v4-result';

const name = 'AI_DecisionRefusalError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

type SuccessfulDecisionAnswer = Exclude<
  DecisionModelV4Answer,
  { type: 'refusal' }
>;

type DecisionUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
};

type DecisionResponse = NonNullable<DecisionModelV4Result['response']> & {
  timestamp: Date;
  modelId: string;
};

/**
 * A decision model declined to answer one or more questions.
 */
export class DecisionRefusalError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly questionIds: string[];
  readonly provider: string;
  readonly modelId: string;
  /**
   * Validated answers for questions that were not refused.
   */
  readonly answers: Record<string, SuccessfulDecisionAnswer> | undefined;
  /**
   * Token usage for the decision model call.
   */
  readonly usage: DecisionUsage | undefined;
  /**
   * Warnings returned by the decision model.
   */
  readonly warnings: DecisionModelV4Result['warnings'] | undefined;
  /**
   * Provider-declared decimal precision for probabilities and scores.
   */
  readonly rounding: DecisionModelV4Result['rounding'];
  /**
   * Provider-specific metadata returned by the decision model.
   */
  readonly providerMetadata: DecisionModelV4Result['providerMetadata'];
  /**
   * Response metadata for the decision model call.
   */
  readonly response: DecisionResponse | undefined;

  constructor({
    questionIds,
    provider,
    modelId,
    answers,
    usage,
    warnings,
    rounding,
    providerMetadata,
    response,
    message = `Decision model "${modelId}" from provider "${provider}" refused ${questionIds.length === 1 ? 'question' : 'questions'} ${questionIds.map(id => JSON.stringify(id)).join(', ')}.`,
  }: {
    questionIds: string[];
    provider: string;
    modelId: string;
    answers?: Record<string, SuccessfulDecisionAnswer>;
    usage?: DecisionUsage;
    warnings?: DecisionModelV4Result['warnings'];
    rounding?: DecisionModelV4Result['rounding'];
    providerMetadata?: DecisionModelV4Result['providerMetadata'];
    response?: DecisionResponse;
    message?: string;
  }) {
    super({ name, message });

    this.questionIds = questionIds;
    this.provider = provider;
    this.modelId = modelId;
    this.answers = answers;
    this.usage = usage;
    this.warnings = warnings;
    this.rounding = rounding;
    this.providerMetadata = providerMetadata;
    this.response = response;
  }

  static isInstance(error: unknown): error is DecisionRefusalError {
    return AISDKError.hasMarker(error, marker);
  }
}
