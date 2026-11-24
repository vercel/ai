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
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { BasetenDecisionModelId } from './baseten-decision-model-options';
import { basetenFailedResponseHandler } from './baseten-error';
import { basetenDecisionModelLimits as limits } from './baseten-model-catalog';

const supportedImageMediaTypes = ['image/jpeg', 'image/png', 'image/webp'];

type BasetenDecisionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

type SystemOneContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export class DecisionBasetenModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = limits.supportedQuestionTypes;

  constructor(
    readonly modelId: BasetenDecisionModelId,
    private readonly config: BasetenDecisionModelConfig,
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
    config: BasetenDecisionModelConfig;
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
        message: 'Baseten decisions require at least one question.',
      });
    }

    let optionCount = 0;
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        const instructions = question.instructions !== undefined && {
          instructions: question.instructions,
        };
        switch (question.type) {
          case 'boolean':
            optionCount += 2;
            return [
              id,
              {
                type: 'noul',
                ...instructions,
                // Baseten requires both outcomes when criteria are present; a
                // null description uses its default for that outcome.
                ...(question.criteria != null && {
                  criteria: {
                    true: question.criteria.true ?? null,
                    false: question.criteria.false ?? null,
                  },
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
                message: `Baseten Choice questions support ${limits.minChoiceOptions} to ${limits.maxChoiceOptions} options.`,
              });
            }
            optionCount += count;
            return [
              id,
              { type: 'choice', ...instructions, criteria: question.criteria },
            ];
          }
          case 'score':
            if (
              question.criteria.length < limits.minScoreLevels ||
              question.criteria.length > limits.maxScoreLevels
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `Baseten Score questions support ${limits.minScoreLevels} to ${limits.maxScoreLevels} levels.`,
              });
            }
            optionCount += question.criteria.length;
            return [
              id,
              { type: 'score', ...instructions, criteria: question.criteria },
            ];
          case 'box':
            throw new UnsupportedFunctionalityError({
              functionality: 'Baseten decision Box questions',
            });
        }
      }),
    );
    if (optionCount > limits.maxOptions) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message: `Baseten decisions support at most ${limits.maxOptions} options across all questions. Each boolean question counts as two.`,
      });
    }

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/systemone`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        state: convertToSystemOneState(state),
        questions: nativeQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: basetenFailedResponseHandler,
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
        message: 'Baseten must return exactly one answer for every question.',
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
        ...Object.keys(providerOptions?.baseten ?? {}).map(option => ({
          type: 'unsupported' as const,
          feature: `providerOptions.baseten.${option}`,
        })),
      ],
      providerMetadata: {
        baseten: {
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
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function convertToSystemOneState(state: DecisionModelV4State): JSONValue {
  const values: JSONValue[] = [];
  for (const part of state) {
    if (part.type === 'file') {
      return convertToSystemOneConversation(state);
    }
    values.push(part.type === 'text' ? part.text : part.value);
  }

  // A single string, object, or array is sent as is; other combinations are
  // joined as text.
  const single = values[0];
  return values.length === 1 &&
    single !== null &&
    (typeof single === 'string' || typeof single === 'object')
    ? single
    : values
        .map(value =>
          typeof value === 'string' ? value : JSON.stringify(value),
        )
        .join('\n');
}

// System One reads images only from user message content; other JSON state is
// rendered as text.
function convertToSystemOneConversation(
  state: DecisionModelV4State,
): JSONValue {
  let imageCount = 0;
  const content = state.map((part): SystemOneContentPart => {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text };
      case 'json':
        return {
          type: 'text',
          text:
            typeof part.value === 'string'
              ? part.value
              : JSON.stringify(part.value),
        };
      case 'file':
        imageCount++;
        return { type: 'image_url', image_url: { url: toImageUrl(part) } };
    }
  });
  if (imageCount > limits.maxImages) {
    throw new InvalidArgumentError({
      argument: 'state',
      message: `Baseten decisions support at most ${limits.maxImages} images per request.`,
    });
  }
  return { messages: [{ role: 'user', content }] };
}

function toImageUrl(
  part: Extract<DecisionModelV4State[number], { type: 'file' }>,
): string {
  if (getTopLevelMediaType(part.mediaType) !== 'image') {
    throw new UnsupportedFunctionalityError({
      functionality: `Baseten decision file media type: ${part.mediaType}`,
    });
  }
  switch (part.data.type) {
    case 'url':
      return part.data.url.toString();
    case 'data': {
      const mediaType = isFullMediaType(part.mediaType)
        ? part.mediaType
        : detectMediaType({ data: part.data.data, topLevelType: 'image' });
      if (mediaType == null || !supportedImageMediaTypes.includes(mediaType)) {
        throw new UnsupportedFunctionalityError({
          functionality: `Baseten decision image media type: ${mediaType ?? part.mediaType}`,
        });
      }
      const data =
        typeof part.data.data === 'string'
          ? part.data.data
          : convertUint8ArrayToBase64(part.data.data);
      return `data:${mediaType};base64,${data}`;
    }
    default:
      throw new UnsupportedFunctionalityError({
        functionality: `Baseten decision file input: ${part.data.type}`,
      });
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
