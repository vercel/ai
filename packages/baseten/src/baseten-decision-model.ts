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
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  basetenDecisionModelOptions,
  type BasetenDecisionModelId,
} from './baseten-decision-model-options';
import { basetenErrorStructure } from './baseten-error';
import { convertToBasetenDecisionState } from './convert-to-baseten-decision-state';

type BasetenDecisionConfig = {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class DecisionBasetenModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

  constructor(
    readonly modelId: BasetenDecisionModelId,
    private readonly config: BasetenDecisionConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionBasetenModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: BasetenDecisionModelId;
    config: BasetenDecisionConfig;
  }) {
    return new DecisionBasetenModel(options.modelId, options.config);
  }

  async doDecide({
    state,
    questions,
    maxOutputTokens,
    reasoning,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<DecisionModelV4['doDecide']>[0]): Promise<
    Awaited<ReturnType<DecisionModelV4['doDecide']>>
  > {
    const entries = Object.entries(questions);
    if (entries.length === 0) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message: 'Baseten decision models require at least one question.',
      });
    }
    let optionCount = 0;
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        switch (question.type) {
          case 'boolean':
            optionCount += 2;
            return [
              id,
              {
                type: 'noul',
                instructions: question.instructions,
                criteria:
                  question.criteria == null
                    ? undefined
                    : {
                        true: question.criteria.true ?? null,
                        false: question.criteria.false ?? null,
                      },
              },
            ];
          case 'choice': {
            const count = Object.keys(question.criteria).length;
            if (count === 0 || count > 255) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: 'Baseten Choice questions support 1 to 255 options.',
              });
            }
            optionCount += count;
            return [id, question];
          }
          case 'score':
            if (
              question.criteria.length === 0 ||
              question.criteria.length > 10
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: 'Baseten Score questions support 1 to 10 levels.',
              });
            }
            optionCount += question.criteria.length;
            return [id, question];
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
    if (optionCount > 512) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message:
          'Baseten decision models support at most 512 options per request.',
      });
    }
    const basetenOptions = await parseProviderOptions({
      provider: 'baseten',
      providerOptions,
      schema: basetenDecisionModelOptions,
    });
    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/systemone`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        state: convertToBasetenDecisionState(state),
        questions: nativeQuestions,
        max_len: basetenOptions?.maxLen,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: createJsonErrorResponseHandler(
        basetenErrorStructure,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        basetenDecisionResponseSchema,
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
          'Baseten decision models must return exactly one answer for every question.',
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
      warnings: [
        ...(maxOutputTokens != null
          ? [{ type: 'unsupported' as const, feature: 'maxOutputTokens' }]
          : []),
        ...(reasoning != null
          ? [{ type: 'unsupported' as const, feature: 'reasoning' }]
          : []),
        ...Object.keys(providerOptions?.baseten ?? {})
          .filter(option => option !== 'maxLen')
          .map(option => ({
            type: 'unsupported' as const,
            feature: `providerOptions.baseten.${option}`,
          })),
      ],
      providerMetadata: {
        baseten: {
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
        id: responseHeaders?.['x-baseten-request-id'],
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

const probability = () => z.number().min(0).max(1);
const basetenDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      model: z.string().nullish(),
      answers: z.record(
        z.string(),
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('noul'), noul: probability() }),
          z.object({
            type: z.literal('choice'),
            choice: z.string(),
            probabilities: z.record(z.string(), probability()),
            confidence: probability().nullish(),
          }),
          z.object({
            type: z.literal('score'),
            score: z.number(),
            probabilities: z.record(z.string(), probability()),
            confidence: probability().nullish(),
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
    }),
  ),
);
