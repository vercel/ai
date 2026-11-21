import {
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
  type JSONValue,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  detectMediaType,
  getTopLevelMediaType,
  isFullMediaType,
  lazySchema,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { LiquidConfig } from './liquid-config';
import type { LiquidDecisionModelId } from './liquid-decision-model-options';
import { liquidFailedResponseHandler } from './liquid-error';
import { liquidDecisionModelLimits as limits } from './liquid-model-catalog';

const supportedMediaTypes = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  audio: ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg'],
} as const;

export class DecisionLiquidModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = limits.supportedQuestionTypes;

  constructor(
    readonly modelId: LiquidDecisionModelId,
    private readonly config: LiquidConfig,
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
    config: LiquidConfig;
  }) {
    return new DecisionLiquidModel(options.modelId, options.config);
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
        message: `Liquid decisions support 1 to ${limits.maxQuestions} questions per request.`,
      });
    }
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        if (question.instructions == null) {
          throw new InvalidArgumentError({
            argument: `questions.${id}.instructions`,
            message: 'Liquid decision questions require instructions.',
          });
        }
        switch (question.type) {
          case 'boolean':
            return [
              id,
              {
                type: 'noul',
                instructions: question.instructions,
                ...(question.criteria != null && {
                  criteria: question.criteria,
                }),
              },
            ];
          case 'choice': {
            const count = Object.keys(question.criteria).length;
            if (
              count < limits.minChoiceOptions ||
              count > limits.maxChoiceOptions
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `Liquid Choice questions support ${limits.minChoiceOptions} to ${limits.maxChoiceOptions} options.`,
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
              question.criteria.length < limits.minScoreLevels ||
              question.criteria.length > limits.maxScoreLevels ||
              question.criteria.some(level => level == null)
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `Liquid Score questions require ${limits.minScoreLevels} to ${limits.maxScoreLevels} non-null levels.`,
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
          case 'box':
            return [id, { type: 'box', instructions: question.instructions }];
        }
      }),
    );

    const {
      state: nativeState,
      images,
      audio,
    } = convertToLiquidDecisionInput(state);
    if (
      entries.some(([, question]) => question.type === 'box') &&
      images.length !== 1
    ) {
      throw new InvalidArgumentError({
        argument: 'state',
        message: 'Liquid Box questions require exactly one image in the state.',
      });
    }

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/decisions/v1/systemone`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        state: nativeState,
        ...(images.length > 0 && { images }),
        ...(audio.length > 0 && { audio }),
        questions: nativeQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: liquidFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        liquidDecisionResponseSchema,
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
        message: 'Liquid must return exactly one answer for every question.',
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
            case 'box':
              // Liquid omits the box when the object is not found (found < 0.5).
              return [
                id,
                answer.box == null
                  ? { type: 'refusal' }
                  : { type: 'box', box: answer.box },
              ];
          }
        }),
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
        ...Object.keys(providerOptions?.liquid ?? {}).map(option => ({
          type: 'unsupported' as const,
          feature: `providerOptions.liquid.${option}`,
        })),
      ],
      providerMetadata: {
        liquid: {
          ...(response.usage?.cost != null && { cost: response.usage.cost }),
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
          found: Object.fromEntries(
            answers.flatMap(([id, answer]) =>
              answer.type === 'box' && answer.found != null
                ? [[id, answer.found]]
                : [],
            ),
          ),
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

function convertToLiquidDecisionInput(state: DecisionModelV4State) {
  const values: JSONValue[] = [];
  const images: string[] = [];
  const audio: string[] = [];
  for (const part of state) {
    switch (part.type) {
      case 'text':
        values.push(part.text);
        break;
      case 'json':
        values.push(part.value);
        break;
      case 'file': {
        const kind = getTopLevelMediaType(part.mediaType);
        if (kind !== 'image' && kind !== 'audio') {
          throw new UnsupportedFunctionalityError({
            functionality: `Liquid decision file media type: ${part.mediaType}`,
          });
        }
        if (part.data.type !== 'data') {
          throw new UnsupportedFunctionalityError({
            functionality: `Liquid decision file input: ${part.data.type}`,
          });
        }
        const mediaType = isFullMediaType(part.mediaType)
          ? part.mediaType
          : detectMediaType({ data: part.data.data, topLevelType: kind });
        if (
          mediaType == null ||
          !supportedMediaTypes[kind].some(type => type === mediaType)
        ) {
          throw new UnsupportedFunctionalityError({
            functionality: `Liquid decision ${kind} media type: ${mediaType ?? part.mediaType}`,
          });
        }
        const data =
          typeof part.data.data === 'string'
            ? part.data.data
            : convertUint8ArrayToBase64(part.data.data);
        // Liquid reads images and audio from top-level arrays, before the state.
        (kind === 'image' ? images : audio).push(
          `data:${mediaType};base64,${data}`,
        );
        break;
      }
    }
  }

  if (images.length > limits.maxImages || audio.length > limits.maxAudioClips) {
    throw new InvalidArgumentError({
      argument: 'state',
      message: `Liquid decisions support at most ${limits.maxImages} images and ${limits.maxAudioClips} audio clips per request.`,
    });
  }

  // The API accepts plain text or structured JSON. A single string, object, or
  // array is sent as is; other combinations are joined as text.
  const single = values[0];
  return {
    state:
      values.length === 0
        ? null
        : values.length === 1 &&
            single !== null &&
            (typeof single === 'string' || typeof single === 'object')
          ? single
          : values
              .map(value =>
                typeof value === 'string' ? value : JSON.stringify(value),
              )
              .join('\n'),
    images,
    audio,
  };
}

const probability = () => z.number().min(0).max(1);
const liquidDecisionResponseSchema = lazySchema(() =>
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
          z.object({
            type: z.literal('box'),
            box: z
              .object({
                top: probability(),
                bottom: probability(),
                left: probability(),
                right: probability(),
              })
              .nullish(),
            found: probability().nullish(),
            confidence: probability().nullish(),
          }),
        ]),
      ),
      usage: z
        .object({
          input_tokens: z.number().nullish(),
          output_tokens: z.number().nullish(),
          cost: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
);
