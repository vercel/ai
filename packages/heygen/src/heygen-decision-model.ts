import {
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
  type JSONValue,
  type LanguageModelV4FilePart,
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
  resolveProviderReference,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { HeyGenConfig } from './heygen-config';
import type { HeyGenDecisionModelId } from './heygen-decision-model-options';
import { heygenFailedResponseHandler } from './heygen-error';
import { heyGenDecisionModelLimits as limits } from './heygen-model-catalog';

type HeyGenDecisionAsset =
  | { type: 'url'; url: string }
  | { type: 'asset_id'; asset_id: string }
  | { type: 'base64'; media_type: string; data: string };

export class DecisionHeyGenModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = limits.supportedQuestionTypes;

  constructor(
    readonly modelId: HeyGenDecisionModelId,
    private readonly config: HeyGenConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionHeyGenModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: HeyGenDecisionModelId;
    config: HeyGenConfig;
  }) {
    return new DecisionHeyGenModel(options.modelId, options.config);
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
        message: `HeyGen Decision supports 1 to ${limits.maxQuestions} questions per request.`,
      });
    }
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        if (id.length === 0 || id.trim() !== id || /[:\r\n]/.test(id)) {
          throw new InvalidArgumentError({
            argument: 'questions',
            message:
              'HeyGen Decision question names must be nonempty, contain no colon or newline, and have no leading or trailing whitespace.',
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
            if (count === 0 || count > limits.maxChoiceOptions) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `HeyGen Choice questions support 1 to ${limits.maxChoiceOptions} options.`,
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
              question.criteria.length > limits.maxScoreLevels ||
              question.criteria.some(level => level == null)
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `HeyGen Score questions require 1 to ${limits.maxScoreLevels} non-null levels.`,
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

    const { state: nativeState, assets } = convertToHeyGenDecisionInput(state);

    const {
      value: { data },
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/v3/models/decisions`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        state: nativeState,
        ...(assets != null && { assets }),
        questions: nativeQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: heygenFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        heyGenDecisionResponseSchema,
      ),
    });

    if (
      Object.keys(data.answers).length !== entries.length ||
      entries.some(
        ([id]) => !Object.prototype.hasOwnProperty.call(data.answers, id),
      )
    ) {
      throw new InvalidResponseDataError({
        data: rawValue,
        message:
          'HeyGen Decision must return exactly one answer for every question.',
      });
    }

    const answers = Object.entries(data.answers);
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
      usage:
        data.usage == null
          ? undefined
          : {
              inputTokens: data.usage.input_tokens ?? undefined,
              outputTokens: data.usage.output_tokens ?? undefined,
            },
      warnings: [
        ...(maxOutputTokens != null
          ? [{ type: 'unsupported' as const, feature: 'maxOutputTokens' }]
          : []),
        ...(reasoning != null
          ? [{ type: 'unsupported' as const, feature: 'reasoning' }]
          : []),
        ...Object.keys(providerOptions?.heygen ?? {}).map(option => ({
          type: 'unsupported' as const,
          feature: `providerOptions.heygen.${option}`,
        })),
      ],
      providerMetadata: {
        heygen: {
          ...(data.request_id != null && { requestId: data.request_id }),
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
          answerWarnings: Object.fromEntries(
            answers.flatMap(([id, answer]) =>
              answer.warning != null ? [[id, answer.warning]] : [],
            ),
          ),
        },
      },
      response: {
        id: data.id ?? undefined,
        modelId: data.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function convertToHeyGenDecisionInput(state: DecisionModelV4State) {
  const values: JSONValue[] = [];
  const images: Record<string, HeyGenDecisionAsset> = {};
  const videos: Record<string, HeyGenDecisionAsset> = {};
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
        if (kind !== 'image' && kind !== 'video') {
          throw new UnsupportedFunctionalityError({
            functionality: `HeyGen decision file media type: ${part.mediaType}`,
          });
        }
        // Asset names are not shown to the model; it reads images, then
        // videos, then state, each in request order.
        const group = kind === 'image' ? images : videos;
        group[`${kind}-${Object.keys(group).length + 1}`] = toHeyGenAsset(
          part,
          kind,
        );
        break;
      }
    }
  }

  if (
    Object.keys(images).length > limits.maxImages ||
    Object.keys(videos).length > limits.maxVideos
  ) {
    throw new InvalidArgumentError({
      argument: 'state',
      message: `HeyGen Decision supports at most ${limits.maxImages} images and ${limits.maxVideos} video per request.`,
    });
  }

  const hasImages = Object.keys(images).length > 0;
  const hasVideos = Object.keys(videos).length > 0;
  // A single string, object, or array is sent as native state. Other values
  // stay in an array because the API rejects a root number, boolean, or null.
  const single = values[0];
  return {
    state:
      values.length === 1 &&
      single !== null &&
      (typeof single === 'string' || typeof single === 'object')
        ? single
        : values,
    assets:
      hasImages || hasVideos
        ? {
            ...(hasImages && { images }),
            ...(hasVideos && { videos }),
          }
        : undefined,
  };
}

function toHeyGenAsset(
  part: LanguageModelV4FilePart,
  kind: 'image' | 'video',
): HeyGenDecisionAsset {
  switch (part.data.type) {
    case 'url':
      if (part.data.url.protocol !== 'https:') {
        throw new InvalidArgumentError({
          argument: 'state',
          message: 'HeyGen decision media URLs must use HTTPS.',
        });
      }
      return { type: 'url', url: part.data.url.href };
    case 'reference':
      return {
        type: 'asset_id',
        asset_id: resolveProviderReference({
          reference: part.data.reference,
          provider: 'heygen',
        }),
      };
    case 'data': {
      const mediaType = isFullMediaType(part.mediaType)
        ? part.mediaType
        : detectMediaType({ data: part.data.data, topLevelType: kind });
      if (mediaType == null) {
        throw new InvalidArgumentError({
          argument: 'state',
          message: `Could not detect the ${kind} media type. Specify a full mediaType such as ${kind === 'image' ? 'image/png' : 'video/mp4'}.`,
        });
      }
      return {
        type: 'base64',
        media_type: mediaType,
        data:
          typeof part.data.data === 'string'
            ? part.data.data
            : convertUint8ArrayToBase64(part.data.data),
      };
    }
    case 'text':
      throw new UnsupportedFunctionalityError({
        functionality: 'HeyGen decision inline text files',
      });
  }
}

const probability = () => z.number().min(0).max(1);
const heyGenDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.object({
        id: z.string().nullish(),
        request_id: z.string().nullish(),
        model: z.string().nullish(),
        answers: z.record(
          z.string(),
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal('noul'),
              noul: probability(),
              warning: z.string().nullish(),
            }),
            z.object({
              type: z.literal('choice'),
              choice: z.string(),
              probabilities: z.record(z.string(), probability()),
              confidence: probability().nullish(),
              warning: z.string().nullish(),
            }),
            z.object({
              type: z.literal('score'),
              score: z.number(),
              probabilities: z.record(z.string(), probability()),
              confidence: probability().nullish(),
              legend: z.record(z.string(), z.json()).nullish(),
              warning: z.string().nullish(),
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
    }),
  ),
);
