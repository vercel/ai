import {
  Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError,
  type Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import { logWarnings } from '../logger/log-warnings';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type {
  EvaluationModel,
  EvaluationQuestion,
  EvaluationResult,
} from './evaluation-result';
import {
  validateEvaluationInput,
  validateEvaluationAnswers,
} from './validate-evaluation';

/** Evaluate typed questions against one shared state. Experimental. */
export async function evaluate<
  const QUESTIONS extends Record<string, EvaluationQuestion>,
>({
  model,
  state,
  questions,
  maxRetries,
  abortSignal,
  headers,
  providerOptions = {},
}: {
  /** An evaluation model instance. String model resolution is not yet supported. */
  model: EvaluationModel;
  state: EvaluationModelV4CallOptions['state'];
  questions: QUESTIONS;
  /** Maximum retries for transient provider failures. Defaults to 2. */
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  providerOptions?: ProviderOptions;
}): Promise<EvaluationResult<QUESTIONS>> {
  if (model.specificationVersion !== 'v4') {
    throw new UnsupportedModelVersionError({
      version: model.specificationVersion,
      provider: model.provider,
      modelId: model.modelId,
    });
  }

  validateEvaluationInput({ state, questions });

  for (const [questionId, question] of Object.entries(questions)) {
    if (!model.supportedQuestionTypes.includes(question.type)) {
      throw new EvaluationUnsupportedQuestionTypeError({
        questionId,
        questionType: question.type,
        provider: model.provider,
        modelId: model.modelId,
      });
    }
  }

  const { retry } = prepareRetries({ maxRetries, abortSignal });
  const result = await retry(() => {
    abortSignal?.throwIfAborted();
    return model.doEvaluate({
      state,
      questions,
      abortSignal,
      headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
      providerOptions,
    });
  });

  abortSignal?.throwIfAborted();
  validateEvaluationAnswers({
    questions,
    answers: result.answers,
    rounding: result.rounding,
  });
  logWarnings({
    warnings: result.warnings,
    provider: model.provider,
    model: model.modelId,
  });

  const inputTokens = result.usage?.inputTokens;
  const outputTokens = result.usage?.outputTokens;

  return {
    answers: result.answers as EvaluationResult<QUESTIONS>['answers'],
    usage: {
      inputTokens,
      outputTokens,
      totalTokens:
        inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : undefined,
    },
    warnings: result.warnings,
    rounding: result.rounding,
    providerMetadata: result.providerMetadata,
    response: {
      ...result.response,
      timestamp: result.response?.timestamp ?? new Date(),
      modelId: result.response?.modelId ?? model.modelId,
    },
  };
}
