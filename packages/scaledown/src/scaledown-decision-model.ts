import {
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4Input as DecisionModelV4Input,
} from '@ai-sdk/provider';
import {
  combineHeaders,
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
import { convertToScaleDownState } from './convert-to-scaledown-state';
import { scaledownDecisionResponseSchema } from './scaledown-decision-api';
import { scaledownFailedResponseHandler } from './scaledown-error';
import { VERSION } from './version';

export type ScaleDownDecisionModelId =
  | 'classify'
  | 'classify-1'
  | (string & {});

export type ScaleDownDecisionProviderMetadata = {
  confidence: Record<string, number>;
  legend: Record<string, Record<string, string>>;
  /** Total request cost in USD, when supplied by ScaleDown. */
  cost?: number;
};

type ScaleDownDecisionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class DecisionScaleDownModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'boolean', 'score'] as const;

  constructor(
    readonly modelId: ScaleDownDecisionModelId,
    private readonly config: ScaleDownDecisionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionScaleDownModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ScaleDownDecisionModelId;
    config: ScaleDownDecisionModelConfig;
  }) {
    return new DecisionScaleDownModel(options.modelId, options.config);
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
    const nativeQuestions = Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        const instructions =
          question.instructions == null
            ? undefined
            : toText(question.instructions);
        switch (question.type) {
          case 'choice':
            return [
              id,
              {
                type: 'choice',
                instructions,
                criteria: Object.fromEntries(
                  Object.entries(question.criteria).map(([key, value]) => [
                    key,
                    value == null ? key : toText(value),
                  ]),
                ),
              },
            ];
          case 'boolean':
            return [
              id,
              {
                type: 'noul',
                // The native endpoint ignores noul criteria, so include them
                // in its instructions to preserve their meaning.
                instructions: [
                  instructions,
                  ...Object.entries(question.criteria ?? {}).flatMap(
                    ([key, value]) =>
                      value == null
                        ? []
                        : [
                            `Answer ${key === 'true' ? 'yes' : 'no'} when: ${toText(value)}`,
                          ],
                  ),
                ]
                  .filter(value => value !== undefined)
                  .join('\n'),
              },
            ];
          case 'score':
            if (
              question.criteria.length < 2 ||
              question.criteria.length > 10 ||
              question.criteria.some(level => level === null)
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message:
                  'ScaleDown Score questions require 2 to 10 non-null levels.',
              });
            }
            return [
              id,
              {
                type: 'score',
                instructions,
                criteria: question.criteria.map(toText),
              },
            ];
          default:
            throw new DecisionUnsupportedQuestionTypeError({
              provider: this.provider,
              modelId: this.modelId,
              questionId: id,
              questionType: question.type,
            });
        }
      }),
    );

    const { value, rawValue, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/scaledown`,
      headers: combineHeaders(
        this.config.headers === undefined
          ? withUserAgentSuffix(
              {
                'x-api-key': loadApiKey({
                  apiKey: undefined,
                  environmentVariableName: 'SCALEDOWN_API_KEY',
                  description: 'ScaleDown',
                }),
              },
              `ai-sdk-scaledown/${VERSION}`,
            )
          : await resolve(this.config.headers),
        headers,
      ),
      body: {
        model: this.modelId,
        state: convertToScaleDownState(state),
        questions: nativeQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: scaledownFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        scaledownDecisionResponseSchema,
      ),
    });

    const metadata: ScaleDownDecisionProviderMetadata = {
      confidence: Object.fromEntries(
        Object.entries(value.answers).flatMap(([id, answer]) =>
          answer.type !== 'noul' && answer.confidence != null
            ? [[id, answer.confidence]]
            : [],
        ),
      ),
      legend: Object.fromEntries(
        Object.entries(value.answers).flatMap(([id, answer]) =>
          answer.type === 'score' && answer.legend != null
            ? [[id, answer.legend]]
            : [],
        ),
      ),
      ...(value.usage?.cost != null && { cost: value.usage.cost }),
    };

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
                : {
                    type: 'score',
                    score: answer.score,
                    probabilities: answer.probabilities,
                  },
          ],
        ),
      ),
      usage: {
        inputTokens: value.usage?.input_tokens ?? undefined,
        outputTokens: value.usage?.output_tokens ?? undefined,
      },
      providerMetadata: { scaledown: metadata },
      warnings: [
        ...(maxOutputTokens != null
          ? [{ type: 'unsupported' as const, feature: 'maxOutputTokens' }]
          : []),
        ...(reasoning != null
          ? [{ type: 'unsupported' as const, feature: 'reasoning' }]
          : []),
        ...Object.keys(providerOptions?.scaledown ?? {}).map(key => ({
          type: 'unsupported' as const,
          feature: `providerOptions.scaledown.${key}`,
        })),
      ],
      response: {
        modelId: value.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function toText(value: DecisionModelV4Input | null): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
