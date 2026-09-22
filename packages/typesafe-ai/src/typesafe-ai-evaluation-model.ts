import {
  InvalidArgumentError,
  type Experimental_EvaluationModelV4 as EvaluationModelV4,
  type Experimental_EvaluationModelV4Answer as EvaluationModelV4Answer,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  loadApiKey,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  withUserAgentSuffix,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  typesafeEvaluationResponseSchema,
  typesafeFailedResponseHandler,
} from './typesafe-ai-evaluation-api';
import { VERSION } from './version';

export type TypeSafeAiEvaluationModelId = 'jev-latest' | (string & {});

type TypeSafeAiEvaluationModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class EvaluationTypeSafeAiModel implements EvaluationModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

  constructor(
    readonly modelId: TypeSafeAiEvaluationModelId,
    private readonly config: TypeSafeAiEvaluationModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: EvaluationTypeSafeAiModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: TypeSafeAiEvaluationModelId;
    config: TypeSafeAiEvaluationModelConfig;
  }) {
    return new EvaluationTypeSafeAiModel(options.modelId, options.config);
  }

  async doEvaluate({
    state,
    questions,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EvaluationModelV4['doEvaluate']>[0]): Promise<
    Awaited<ReturnType<EvaluationModelV4['doEvaluate']>>
  > {
    for (const [id, question] of Object.entries(questions)) {
      if (
        question.type === 'choice' &&
        Object.keys(question.criteria).length > 255
      ) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message: 'TypeSafe Choice questions support at most 255 options.',
        });
      }
      if (question.type === 'score' && question.criteria.length > 10) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message: 'TypeSafe Score questions support at most 10 levels.',
        });
      }
    }

    const warnings: SharedV4Warning[] = Object.keys(
      providerOptions?.typesafe ?? {},
    ).map(option => ({
      type: 'unsupported',
      feature: `providerOptions.typesafe.${option}`,
    }));
    const modelHeaders =
      this.config.headers === undefined
        ? withUserAgentSuffix(
            {
              Authorization: `Bearer ${loadApiKey({ apiKey: undefined, environmentVariableName: 'TYPESAFE_AI_API_KEY', description: 'TypeSafe' })}`,
            },
            `ai-sdk-typesafe-ai/${VERSION}`,
          )
        : await resolve(this.config.headers);
    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/systemone`,
      headers: combineHeaders(modelHeaders, headers),
      body: {
        model: this.modelId,
        state,
        questions: Object.fromEntries(
          Object.entries(questions).map(([id, question]) => [
            id,
            question.type === 'boolean'
              ? { ...question, type: 'noul' }
              : question,
          ]),
        ),
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: typesafeFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        typesafeEvaluationResponseSchema,
      ),
    });

    const confidence = Object.fromEntries(
      Object.entries(response.answers).flatMap(([id, answer]) =>
        answer.type !== 'noul' && answer.confidence != null
          ? [[id, answer.confidence]]
          : [],
      ),
    );

    return {
      answers: Object.fromEntries(
        Object.entries(response.answers).map(
          ([id, answer]): [string, EvaluationModelV4Answer] => {
            switch (answer.type) {
              case 'noul':
                return [id, { type: 'boolean', probability: answer.noul }];
              case 'choice':
                return [
                  id,
                  {
                    type: 'choice',
                    choice: answer.choice,
                    probabilities: answer.probabilities,
                  },
                ];
              case 'score':
                return [
                  id,
                  {
                    type: 'score',
                    score: answer.score,
                    probabilities: answer.probabilities,
                  },
                ];
            }
          },
        ),
      ),
      usage: {
        inputTokens: response.usage?.input_tokens ?? undefined,
        outputTokens: response.usage?.output_tokens ?? undefined,
      },
      // The API rounds displayed probabilities and scores to two decimal places.
      rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
      warnings,
      providerMetadata: { typesafe: { confidence } },
      response: {
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}
