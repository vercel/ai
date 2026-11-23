import {
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4Input as DecisionModelV4Input,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  detectMediaType,
  getTopLevelMediaType,
  isFullMediaType,
  lazySchema,
  mediaTypeToExtension,
  postFormDataToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { HumeConfig } from './hume-config';
import type { HumeDecisionModelId } from './hume-decision-model-options';
import { humeFailedResponseHandler } from './hume-error';
import { humeDecisionModelLimits as limits } from './hume-model-catalog';

const supportedMediaTypes = ['audio/mpeg', 'audio/wav'] as const;

export class DecisionHumeModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = limits.supportedQuestionTypes;

  constructor(
    readonly modelId: HumeDecisionModelId,
    private readonly config: HumeConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionHumeModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: HumeDecisionModelId;
    config: HumeConfig;
  }) {
    return new DecisionHumeModel(options.modelId, options.config);
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
    if (entries.length === 0 || entries.length > limits.maxQuestions) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message: `Hume decisions support 1 to ${limits.maxQuestions} questions per request.`,
      });
    }
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        if (question.instructions == null) {
          throw new InvalidArgumentError({
            argument: `questions.${id}.instructions`,
            message: 'Hume decision questions require instructions.',
          });
        }
        const instructions = toText(
          question.instructions,
          `questions.${id}.instructions`,
        );
        switch (question.type) {
          case 'boolean': {
            const criteria = Object.fromEntries(
              (['true', 'false'] as const).flatMap(key => {
                const value = question.criteria?.[key];
                return value == null
                  ? []
                  : [[key, toText(value, `questions.${id}.criteria.${key}`)]];
              }),
            );
            return [
              id,
              {
                type: 'noul',
                instructions,
                ...(Object.keys(criteria).length > 0 && { criteria }),
              },
            ];
          }
          case 'choice': {
            const options = Object.entries(question.criteria);
            if (
              options.length < limits.minChoiceOptions ||
              options.length > limits.maxChoiceOptions
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `Hume Choice questions support ${limits.minChoiceOptions} to ${limits.maxChoiceOptions} options.`,
              });
            }
            return [
              id,
              {
                type: 'choice',
                instructions,
                criteria: options.map(([name, description]) => ({
                  name,
                  ...(description != null && {
                    description: toText(
                      description,
                      `questions.${id}.criteria.${name}`,
                    ),
                  }),
                })),
              },
            ];
          }
          case 'score': {
            const levels = question.criteria;
            if (
              levels.length < limits.minScoreLevels ||
              levels.length > limits.maxScoreLevels ||
              levels.some(level => level == null)
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `Hume Score questions require ${limits.minScoreLevels} to ${limits.maxScoreLevels} non-null levels.`,
              });
            }
            return [
              id,
              {
                type: 'score',
                instructions,
                criteria: levels.map((level, index) =>
                  toText(level, `questions.${id}.criteria.${index}`),
                ),
              },
            ];
          }
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

    const { context, audio } = convertToHumeDecisionInput(state);

    // Hume requires the request part before the file part.
    const formData = new FormData();
    formData.append(
      'request',
      new Blob(
        [
          JSON.stringify({
            ...(context != null && { context }),
            questions: nativeQuestions,
          }),
        ],
        { type: 'application/json' },
      ),
    );
    formData.append(
      'file',
      new Blob([audio.data], { type: audio.mediaType }),
      `audio.${mediaTypeToExtension(audio.mediaType)}`,
    );

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postFormDataToApi({
      url: `${this.config.baseURL}/v0/decisions/file`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      formData,
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: humeFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        humeDecisionResponseSchema,
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
        message: 'Hume must return exactly one answer for every question.',
      });
    }

    const answers = Object.entries(response.answers);
    return {
      answers: Object.fromEntries(
        answers.map(([id, answer]): [string, DecisionModelV4Answer] => {
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
        }),
      ),
      // The API rounds probabilities and scores to four decimal places.
      rounding: { probabilityDecimals: 4, scoreDecimals: 4 },
      usage:
        response.received == null
          ? undefined
          : { inputTokens: response.received.input_tokens ?? undefined },
      warnings: [
        ...(maxOutputTokens != null
          ? [{ type: 'unsupported' as const, feature: 'maxOutputTokens' }]
          : []),
        ...(reasoning != null
          ? [{ type: 'unsupported' as const, feature: 'reasoning' }]
          : []),
        ...Object.keys(providerOptions?.hume ?? {}).map(option => ({
          type: 'unsupported' as const,
          feature: `providerOptions.hume.${option}`,
        })),
      ],
      providerMetadata: {
        hume: {
          confidence: Object.fromEntries(
            answers.flatMap(([id, answer]) =>
              answer.type !== 'noul' && answer.confidence != null
                ? [[id, answer.confidence]]
                : [],
            ),
          ),
          legend: Object.fromEntries(
            answers.flatMap(([id, answer]) =>
              answer.type === 'score' && answer.legend != null
                ? [[id, answer.legend]]
                : [],
            ),
          ),
        },
      },
      response: {
        id: response.run_id ?? undefined,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function toText(value: DecisionModelV4Input | null, argument: string): string {
  if (typeof value !== 'string') {
    throw new InvalidArgumentError({
      argument,
      message: 'Hume decision instructions and criteria must be strings.',
    });
  }
  return value;
}

function convertToHumeDecisionInput(state: DecisionModelV4State) {
  const texts: string[] = [];
  const audio: { mediaType: string; data: Uint8Array<ArrayBuffer> }[] = [];
  for (const part of state) {
    switch (part.type) {
      case 'text':
        texts.push(part.text);
        break;
      case 'json':
        throw new UnsupportedFunctionalityError({
          functionality: 'Hume decision JSON state',
        });
      case 'file': {
        if (getTopLevelMediaType(part.mediaType) !== 'audio') {
          throw new UnsupportedFunctionalityError({
            functionality: `Hume decision file media type: ${part.mediaType}`,
          });
        }
        if (part.data.type !== 'data') {
          throw new UnsupportedFunctionalityError({
            functionality: `Hume decision file input: ${part.data.type}`,
          });
        }
        const mediaType = isFullMediaType(part.mediaType)
          ? part.mediaType
          : detectMediaType({ data: part.data.data, topLevelType: 'audio' });
        if (
          mediaType == null ||
          !supportedMediaTypes.some(type => type === mediaType)
        ) {
          throw new UnsupportedFunctionalityError({
            functionality: `Hume decision audio media type: ${mediaType ?? part.mediaType}`,
          });
        }
        audio.push({
          mediaType,
          data:
            typeof part.data.data === 'string'
              ? convertBase64ToUint8Array(part.data.data)
              : (part.data.data as Uint8Array<ArrayBuffer>),
        });
        break;
      }
    }
  }

  if (audio.length !== 1) {
    throw new InvalidArgumentError({
      argument: 'state',
      message: 'Hume decisions require exactly one audio file in the state.',
    });
  }

  return {
    context: texts.length > 0 ? texts.join('\n') : undefined,
    audio: audio[0],
  };
}

const probability = () => z.number().min(0).max(1);
const humeDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      run_id: z.string().nullish(),
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
            legend: z.record(z.string(), z.string()).nullish(),
          }),
        ]),
      ),
      received: z.object({ input_tokens: z.number().nullish() }).nullish(),
    }),
  ),
);
