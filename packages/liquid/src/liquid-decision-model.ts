import {
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
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
  liquidDecisionResponseSchema,
  liquidFailedResponseHandler,
} from './liquid-decision-api';
import { extractLiquidImages } from './liquid-decision-images';
import { VERSION } from './version';

export type LiquidDecisionModelId = 'd1' | 'd1:free' | (string & {});

type LiquidDecisionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class DecisionLiquidModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

  constructor(
    readonly modelId: LiquidDecisionModelId,
    private readonly config: LiquidDecisionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionLiquidModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: LiquidDecisionModelId;
    config: LiquidDecisionModelConfig;
  }) {
    return new DecisionLiquidModel(options.modelId, options.config);
  }

  /** @deprecated Use `doDecide` instead. */
  doEvaluate(options: Parameters<DecisionModelV4['doDecide']>[0]) {
    return this.doDecide(options);
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
    const { state: textState, images } = extractLiquidImages(state);
    if (images !== undefined && this.modelId === 'd1:free') {
      throw new UnsupportedFunctionalityError({
        functionality: 'image inputs with Liquid d1:free; use d1 instead',
      });
    }

    const warnings: SharedV4Warning[] = Object.keys(
      providerOptions?.liquid ?? {},
    ).map(option => ({
      type: 'unsupported',
      feature: `providerOptions.liquid.${option}`,
    }));
    const modelHeaders =
      this.config.headers === undefined
        ? withUserAgentSuffix(
            {
              Authorization: `Bearer ${loadApiKey({ apiKey: undefined, environmentVariableName: 'LIQUID_API_KEY', description: 'Liquid' })}`,
            },
            `ai-sdk-liquid/${VERSION}`,
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
        state: textState,
        ...(images === undefined ? {} : { images }),
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
      failedResponseHandler: liquidFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        liquidDecisionResponseSchema,
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
      ),
      usage: {
        inputTokens: response.usage?.input_tokens ?? undefined,
        outputTokens: response.usage?.output_tokens ?? undefined,
      },
      warnings,
      providerMetadata: {
        liquid: {
          confidence,
          ...(response.usage?.cost == null
            ? {}
            : { cost: response.usage.cost }),
        },
      },
      response: {
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}
