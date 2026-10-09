import {
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  perplexityFailedResponseHandler,
  perplexitySuccessfulResponseHandler,
} from './perplexity-decision-api';
import type { PerplexityDecisionModelId } from './perplexity-decision-model-options';

interface PerplexityDecisionModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

export class PerplexityDecisionModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'boolean', 'score'] as const;

  constructor(
    readonly modelId: PerplexityDecisionModelId,
    private readonly config: PerplexityDecisionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: PerplexityDecisionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: PerplexityDecisionModelId;
    config: PerplexityDecisionModelConfig;
  }) {
    return new PerplexityDecisionModel(options.modelId, options.config);
  }

  private async getHeaders(headers?: Record<string, string | undefined>) {
    const resolvedHeaders = await resolve(this.config.headers);
    return combineHeaders(resolvedHeaders, headers);
  }

  async doDecide({
    state,
    questions,
    headers,
    abortSignal,
  }: Parameters<DecisionModelV4['doDecide']>[0]): Promise<
    Awaited<ReturnType<DecisionModelV4['doDecide']>>
  > {
    const resolvedHeaders = await this.getHeaders(headers);
    const standardQuestions = Object.fromEntries(
      Object.entries(questions).map(([id, question]) => [
        id,
        question.type === 'boolean' ? { ...question, type: 'noul' } : question,
      ]),
    );

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/decisions`,
      headers: resolvedHeaders,
      body: {
        model: this.modelId,
        state,
        questions: standardQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      successfulResponseHandler: perplexitySuccessfulResponseHandler,
      failedResponseHandler: perplexityFailedResponseHandler,
    });
    const answers = Object.fromEntries(
      Object.entries(response.answers).map(
        ([id, answer]): [string, DecisionModelV4Answer] => {
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
    );

    return {
      answers,
      warnings: [],
      response: {
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
        timestamp: new Date(),
      },
      usage: {
        inputTokens: response.usage.input_tokens ?? undefined,
        outputTokens: response.usage.output_tokens ?? undefined,
      },
    };
  }
}
