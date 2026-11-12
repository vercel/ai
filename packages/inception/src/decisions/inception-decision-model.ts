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
  loadApiKey,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  withUserAgentSuffix,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { inceptionDecisionModelLimits } from '../inception-model-catalog';
import { VERSION } from '../version';
import { convertToInceptionDecisionState } from './convert-to-inception-decision-state';
import {
  inceptionDecisionErrorSchema,
  inceptionDecisionResponseSchema,
} from './inception-decision-api';
import type {
  InceptionDecisionModelId,
  InceptionDecisionProviderMetadata,
} from './inception-decision-model-options';

type InceptionDecisionConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class DecisionInceptionModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes =
    inceptionDecisionModelLimits.supportedQuestionTypes;

  constructor(
    readonly modelId: InceptionDecisionModelId,
    private readonly config: InceptionDecisionConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionInceptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: InceptionDecisionModelId;
    config: InceptionDecisionConfig;
  }) {
    return new DecisionInceptionModel(options.modelId, options.config);
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
        message: 'Inception Decisions requires at least one question.',
      });
    }
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        switch (question.type) {
          case 'boolean':
            return [id, { ...question, type: 'noul' }];
          case 'choice': {
            const count = Object.keys(question.criteria).length;
            if (
              count === 0 ||
              count > inceptionDecisionModelLimits.maxChoiceOptions
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `Inception Choice questions support 1 to ${inceptionDecisionModelLimits.maxChoiceOptions} options.`,
              });
            }
            return [id, question];
          }
          case 'score':
            if (
              question.criteria.length === 0 ||
              question.criteria.length >
                inceptionDecisionModelLimits.maxScoreLevels ||
              question.criteria.some(level => level === null)
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `Inception Score questions require 1 to ${inceptionDecisionModelLimits.maxScoreLevels} non-null levels.`,
              });
            }
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

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/decisions`,
      headers: combineHeaders(
        this.config.headers === undefined
          ? withUserAgentSuffix(
              {
                Authorization: `Bearer ${loadApiKey({
                  apiKey: undefined,
                  environmentVariableName: 'INCEPTION_API_KEY',
                  description: 'Inception API key',
                })}`,
              },
              `ai-sdk-inception/${VERSION}`,
            )
          : await resolve(this.config.headers),
        headers,
      ),
      body: {
        model: this.modelId,
        state: convertToInceptionDecisionState(state),
        questions: nativeQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: inceptionDecisionErrorSchema,
        errorToMessage: data =>
          'error' in data
            ? data.error.message
            : typeof data.detail === 'string'
              ? data.detail
              : data.detail.map(detail => detail.msg).join(', '),
      }),
      successfulResponseHandler: createJsonResponseHandler(
        inceptionDecisionResponseSchema,
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
          'Inception Decisions must return exactly one answer for every question.',
      });
    }

    const metadata: InceptionDecisionProviderMetadata = {
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
    };
    const answers = Object.fromEntries(
      Object.entries(response.answers).map(
        ([id, answer]): [string, DecisionModelV4Answer] => {
          if (answer.type === 'noul') {
            return [id, { type: 'boolean', probability: answer.noul }];
          }
          return [
            id,
            answer.type === 'choice'
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
          ];
        },
      ),
    );

    return {
      answers,
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
        ...Object.keys(providerOptions?.inception ?? {}).map(option => ({
          type: 'unsupported' as const,
          feature: `providerOptions.inception.${option}`,
        })),
      ],
      providerMetadata: { inception: metadata },
      response: {
        id: responseHeaders?.['x-request-id'],
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}
