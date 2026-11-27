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
import type { SubquadraticConfig } from './subquadratic-config';
import type { SubquadraticDecisionModelId } from './subquadratic-decision-model-options';
import { subquadraticDecisionFailedResponseHandler } from './subquadratic-error';
import { subquadraticDecisionModelLimits as limits } from './subquadratic-model-catalog';

const supportedImageMediaTypes = ['image/jpeg', 'image/png', 'image/webp'];

export class DecisionSubquadraticModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = limits.supportedQuestionTypes;

  constructor(
    readonly modelId: SubquadraticDecisionModelId,
    private readonly config: SubquadraticConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionSubquadraticModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: SubquadraticDecisionModelId;
    config: SubquadraticConfig;
  }) {
    return new DecisionSubquadraticModel(options.modelId, options.config);
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
        message: `SubQ decisions support 1 to ${limits.maxQuestions} questions per request.`,
      });
    }
    const nativeQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        if (question.type === 'box') {
          throw new UnsupportedFunctionalityError({
            functionality: 'SubQ decision Box questions',
          });
        }
        if (question.instructions == null) {
          throw new InvalidArgumentError({
            argument: `questions.${id}.instructions`,
            message: 'SubQ decision questions require instructions.',
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
                message: `SubQ Choice questions support ${limits.minChoiceOptions} to ${limits.maxChoiceOptions} options.`,
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
              question.criteria.length > limits.maxScoreLevels
            ) {
              throw new InvalidArgumentError({
                argument: `questions.${id}.criteria`,
                message: `SubQ Score questions support ${limits.minScoreLevels} to ${limits.maxScoreLevels} levels.`,
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
        }
      }),
    );

    const { state: nativeState, images } = convertToSubquadraticState(state);

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/systemone`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        state: nativeState,
        ...(images.length > 0 && { images }),
        questions: nativeQuestions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: subquadraticDecisionFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        subquadraticDecisionResponseSchema,
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
        message: 'SubQ must return exactly one answer for every question.',
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
        ...Object.keys(providerOptions?.subquadratic ?? {}).map(option => ({
          type: 'unsupported' as const,
          feature: `providerOptions.subquadratic.${option}`,
        })),
      ],
      providerMetadata: {
        subquadratic: {
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

function convertToSubquadraticState(state: DecisionModelV4State) {
  const values: JSONValue[] = [];
  const images: Array<{ mediaType: string; base64: string }> = [];
  for (const part of state) {
    switch (part.type) {
      case 'text':
        values.push(part.text);
        break;
      case 'json':
        values.push(part.value);
        break;
      case 'file': {
        if (getTopLevelMediaType(part.mediaType) !== 'image') {
          throw new UnsupportedFunctionalityError({
            functionality: `SubQ decision file media type: ${part.mediaType}`,
          });
        }
        if (part.data.type !== 'data') {
          throw new UnsupportedFunctionalityError({
            functionality: `SubQ decision file input: ${part.data.type}`,
          });
        }
        const mediaType = isFullMediaType(part.mediaType)
          ? part.mediaType
          : detectMediaType({ data: part.data.data, topLevelType: 'image' });
        if (
          mediaType == null ||
          !supportedImageMediaTypes.includes(mediaType)
        ) {
          throw new UnsupportedFunctionalityError({
            functionality: `SubQ decision image media type: ${mediaType ?? part.mediaType}`,
          });
        }
        // SubQ reads images from a top-level array of plain base64 values.
        images.push({
          mediaType,
          base64:
            typeof part.data.data === 'string'
              ? part.data.data
              : convertUint8ArrayToBase64(part.data.data),
        });
        break;
      }
    }
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
  };
}

const probability = () => z.number().min(0).max(1);
const subquadraticDecisionResponseSchema = lazySchema(() =>
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
