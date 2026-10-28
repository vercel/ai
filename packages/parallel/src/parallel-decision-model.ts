import {
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  loadApiKey,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  withUserAgentSuffix,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  parallelDecisionResponseSchema,
  parallelErrorSchema,
} from './parallel-decision-api';
import {
  parallelDecisionModelOptions,
  type ParallelDecisionModelId,
  type ParallelDecisionProviderMetadata,
} from './parallel-decision-model-options';
import { VERSION } from './version';

type ParallelDecisionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class ParallelDecisionModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['boolean', 'choice', 'score'] as const;

  constructor(
    readonly modelId: ParallelDecisionModelId,
    private readonly config: ParallelDecisionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: ParallelDecisionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ParallelDecisionModelId;
    config: ParallelDecisionModelConfig;
  }) {
    return new ParallelDecisionModel(options.modelId, options.config);
  }

  async doDecide(
    options: Parameters<DecisionModelV4['doDecide']>[0],
  ): Promise<Awaited<ReturnType<DecisionModelV4['doDecide']>>> {
    const entries = Object.entries(options.questions);
    if (entries.length === 0 || entries.length > 100) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message: 'Parallel Decisions supports 1 to 100 questions.',
      });
    }
    for (const [id, question] of entries) {
      if (!/^[A-Za-z0-9_-]+$/.test(id)) {
        throw new InvalidArgumentError({
          argument: 'questions',
          message:
            'Parallel question names may contain only ASCII letters, numbers, underscores, and hyphens.',
        });
      }
      if (question.type === 'box') {
        throw new DecisionUnsupportedQuestionTypeError({
          modelId: this.modelId,
          provider: this.provider,
          questionId: id,
          questionType: question.type,
        });
      }
      const count =
        question.type === 'choice'
          ? Object.keys(question.criteria).length
          : question.type === 'score'
            ? question.criteria.length
            : undefined;
      if (
        count !== undefined &&
        (count < 2 || count > (question.type === 'choice' ? 255 : 10))
      ) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message:
            question.type === 'choice'
              ? 'Parallel Choice questions require 2 to 255 options.'
              : 'Parallel Score questions require 2 to 10 levels.',
        });
      }
    }

    const parallelOptions = await parseProviderOptions({
      provider: 'parallel',
      providerOptions: options.providerOptions,
      schema: parallelDecisionModelOptions,
    });
    const { value, rawValue, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/decisions`,
      headers: combineHeaders(
        this.config.headers === undefined
          ? withUserAgentSuffix(
              {
                'x-api-key': loadApiKey({
                  apiKey: undefined,
                  environmentVariableName: 'PARALLEL_API_KEY',
                  description: 'Parallel',
                }),
              },
              `ai-sdk-parallel/${VERSION}`,
            )
          : await resolve(this.config.headers),
        options.headers,
      ),
      body: {
        mode: this.modelId,
        ...(parallelOptions?.includeExcerpts !== undefined && {
          include_excerpts: parallelOptions.includeExcerpts,
        }),
        state: toParallelState(options.state),
        questions: Object.fromEntries(
          entries.map(([id, question]) => [
            id,
            question.type === 'boolean'
              ? { ...question, type: 'noul' }
              : question,
          ]),
        ),
      },
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: parallelErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        parallelDecisionResponseSchema,
      ),
    });

    if (
      Object.keys(value.answers).length !== entries.length ||
      entries.some(
        ([id]) => !Object.prototype.hasOwnProperty.call(value.answers, id),
      )
    ) {
      throw new InvalidResponseDataError({
        data: rawValue,
        message:
          'Parallel Decisions must return exactly one answer for every question.',
      });
    }

    return {
      answers: Object.fromEntries(
        Object.entries(value.answers).map(
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
                : answer.type === 'score'
                  ? {
                      type: 'score',
                      score: answer.score,
                      probabilities: answer.probabilities,
                    }
                  : { type: 'refusal' },
          ],
        ),
      ),
      usage: {
        inputTokens: value.usage.input_tokens,
        outputTokens: value.usage.output_tokens,
      },
      providerMetadata: {
        parallel: {
          citations: value.citations,
          confidence: Object.fromEntries(
            Object.entries(value.answers).flatMap(([id, answer]) =>
              (answer.type === 'choice' || answer.type === 'score') &&
              answer.confidence != null
                ? [[id, answer.confidence]]
                : [],
            ),
          ),
          decisionId: value.decision_id,
          legend: Object.fromEntries(
            Object.entries(value.answers).flatMap(([id, answer]) =>
              answer.type === 'score' ? [[id, answer.legend]] : [],
            ),
          ),
          mode: value.mode,
        } satisfies ParallelDecisionProviderMetadata,
      },
      warnings: [
        ...(options.maxOutputTokens != null
          ? [{ type: 'unsupported' as const, feature: 'maxOutputTokens' }]
          : []),
        ...(options.reasoning != null
          ? [{ type: 'unsupported' as const, feature: 'reasoning' }]
          : []),
        ...Object.keys(options.providerOptions?.parallel ?? {})
          .filter(key => key !== 'includeExcerpts')
          .map(key => ({
            type: 'unsupported' as const,
            feature: `providerOptions.parallel.${key}`,
          })),
      ],
      response: {
        id: value.decision_id,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function toParallelState(state: DecisionModelV4State) {
  const values = state.map(part => {
    if (part.type === 'file') {
      throw new UnsupportedFunctionalityError({
        functionality: 'Parallel Decisions file input',
      });
    }
    return part.type === 'text' ? part.text : part.value;
  });
  return values.length === 1 ? values[0] : values;
}
