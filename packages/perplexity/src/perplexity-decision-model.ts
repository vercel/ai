import {
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertToPerplexityDecisionState } from './convert-to-perplexity-decision-state';
import {
  perplexityErrorSchema,
  perplexityErrorToMessage,
} from './perplexity-agent-api';

import type { PerplexityDecisionModelId } from './perplexity-decision-model-options';

type PerplexityDecisionConfig = {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class DecisionPerplexityModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

  constructor(
    readonly modelId: PerplexityDecisionModelId,
    private readonly config: PerplexityDecisionConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionPerplexityModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: PerplexityDecisionModelId;
    config: PerplexityDecisionConfig;
  }) {
    return new DecisionPerplexityModel(options.modelId, options.config);
  }

  async doDecide({
    state,
    questions,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<DecisionModelV4['doDecide']>[0]): Promise<
    Awaited<ReturnType<DecisionModelV4['doDecide']>>
  > {
    const entries = Object.entries(questions);
    if (entries.length === 0 || entries.length > 128) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message:
          'Perplexity Decisions supports 1 to 128 questions per request.',
      });
    }
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        if (id.length === 0) {
          throw new InvalidArgumentError({
            argument: 'questions',
            message: 'Perplexity Decisions requires non-empty question names.',
          });
        }
        switch (question.type) {
          case 'boolean':
            return [
              id,
              {
                type: 'noul',
                instructions: question.instructions,
                criteria: question.criteria,
              },
            ];
          case 'choice': {
            const count = Object.keys(question.criteria).length;
            if (count === 0 || count > 255) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message:
                  'Perplexity Choice questions support 1 to 255 options.',
              });
            }
            return [
              id,
              {
                type: 'choice',
                instructions: question.instructions,
                criteria: question.criteria,
              },
            ];
          }
          case 'score':
            if (
              question.criteria.length === 0 ||
              question.criteria.length > 10 ||
              question.criteria.some(level => level === null)
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message:
                  'Perplexity Score questions require 1 to 10 non-null levels.',
              });
            }
            return [
              id,
              {
                type: 'score',
                instructions: question.instructions,
                criteria: question.criteria,
              },
            ];
          default:
            throw new DecisionUnsupportedQuestionTypeError({
              questionId: id,
              questionType: question.type,
              provider: this.provider,
              modelId: this.modelId,
            });
        }
      }),
    );

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/decisions`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        state: convertToPerplexityDecisionState(state),
        questions: nativeQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: perplexityErrorSchema,
        errorToMessage: perplexityErrorToMessage,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        perplexityDecisionResponseSchema,
      ),
    });

    if (
      Object.keys(response.answers).length !== entries.length ||
      entries.some(
        ([id]) => !Object.prototype.hasOwnProperty.call(response.answers, id),
      )
    ) {
      throw new InvalidResponseDataError({
        data: rawValue,
        message:
          'Perplexity Decisions must return exactly one answer for every question.',
      });
    }

    return {
      answers: Object.fromEntries(
        Object.entries(response.answers).map(
          ([id, answer]): [string, DecisionModelV4Answer] => [
            id,
            answer.type === 'noul'
              ? { type: 'boolean', probability: answer.noul }
              : answer.type === 'choice'
                ? {
                    type: 'choice',
                    choice: answer.choice,
                    probabilities: answer.probabilities,
                  }
                : {
                    type: 'score',
                    score: answer.score,
                    probabilities: answer.probabilities,
                  },
          ],
        ),
      ),
      usage:
        response.usage == null
          ? undefined
          : {
              inputTokens: response.usage.input_tokens ?? undefined,
              outputTokens: response.usage.output_tokens ?? undefined,
            },
      // Perplexity returns full-precision probabilities; no rounding allowance.
      warnings: Object.keys(providerOptions?.perplexity ?? {}).map(option => ({
        type: 'unsupported',
        feature: `providerOptions.perplexity.${option}`,
      })),
      providerMetadata: {
        perplexity: {
          confidence: Object.fromEntries(
            Object.entries(response.answers).flatMap(([id, answer]) =>
              answer.type !== 'noul' && answer.confidence != null
                ? [[id, answer.confidence]]
                : [],
            ),
          ),
          legend: Object.fromEntries(
            Object.entries(response.answers).flatMap(([id, answer]) =>
              answer.type === 'score' && answer.legend != null
                ? [[id, answer.legend]]
                : [],
            ),
          ),
        },
      },
      response: {
        id: responseHeaders?.['x-request-id'],
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

const probability = z.number().min(0).max(1);
const perplexityDecisionResponseSchema = z.object({
  model: z.string().nullish(),
  answers: z.record(
    z.string(),
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('noul'), noul: probability }),
      z.object({
        type: z.literal('choice'),
        choice: z.string(),
        probabilities: z.record(z.string(), probability),
        confidence: probability.nullish(),
      }),
      z.object({
        type: z.literal('score'),
        score: z.number(),
        probabilities: z.record(z.string(), probability),
        confidence: probability.nullish(),
        legend: z.record(z.string(), z.json()).nullish(),
      }),
    ]),
  ),
  usage: z
    .object({
      input_tokens: z.number().nullish(),
      output_tokens: z.number().nullish(),
    })
    .nullish(),
});
