import {
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4Input as DecisionModelV4Input,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  detectMediaType,
  isFullMediaType,
  createJsonResponseHandler,
  postJsonToApi,
  parseProviderOptions,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  prepareOpenAIConfigForWorkflowDeserialize,
  type OpenAIConfig,
} from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import { openaiDecisionModelOptions } from './openai-decision-model-options';

export type OpenAIDecisionModelId = 'gpt-6-luna' | (string & {});

const probability = z.number().min(0).max(1);
const responseSchema = z.object({
  model: z.string().nullish(),
  usage: z
    .object({
      input_tokens: z.number().nullish(),
      input_tokens_details: z
        .object({
          cached_tokens: z.number().nullish(),
          cache_write_tokens: z.number().nullish(),
        })
        .nullish(),
      output_tokens: z.number().nullish(),
      output_tokens_details: z
        .object({
          reasoning_tokens: z.number().nullish(),
        })
        .nullish(),
      total_tokens: z.number().nullish(),
    })
    .nullish(),
  answers: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('refusal'), name: z.string().nullable() }),
      z.object({
        type: z.literal('predicate'),
        name: z.string(),
        probability,
      }),
      z.object({
        type: z.literal('choice'),
        name: z.string(),
        choice: z.string(),
        confidence: probability.nullish(),
        probabilities: z.array(z.object({ value: z.string(), probability })),
      }),
      z.object({
        type: z.literal('score'),
        name: z.string(),
        score: z.number(),
        confidence: probability.nullish(),
        probabilities: z.array(
          z.object({ value: z.number().int().nonnegative(), probability }),
        ),
      }),
    ]),
  ),
});

export class DecisionOpenAIModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

  constructor(
    readonly modelId: OpenAIDecisionModelId,
    private readonly config: OpenAIConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionOpenAIModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: OpenAIDecisionModelId;
    config: Parameters<typeof prepareOpenAIConfigForWorkflowDeserialize>[0];
  }) {
    return new DecisionOpenAIModel(
      options.modelId,
      prepareOpenAIConfigForWorkflowDeserialize(options.config),
    );
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
    const openaiOptions = await parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: openaiDecisionModelOptions,
    });
    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: this.config.url({ path: '/decisions', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers?.(), headers),
      body: {
        model: this.modelId,
        safety_identifier: openaiOptions?.safetyIdentifier,
        input: [
          {
            role: 'user',
            content: state.map(part => {
              if (part.type === 'text')
                return { type: 'input_text', text: part.text };
              if (part.type === 'json')
                return {
                  type: 'input_text',
                  text: JSON.stringify(part.value),
                };
              if (part.data.type !== 'data') {
                throw new UnsupportedFunctionalityError({
                  functionality: `OpenAI decision file input: ${part.mediaType} (${part.data.type})`,
                });
              }
              const mediaType = isFullMediaType(part.mediaType)
                ? part.mediaType
                : detectMediaType({
                    data: part.data.data,
                    topLevelType: 'image',
                  });
              if (
                ![
                  'image/png',
                  'image/jpeg',
                  'image/webp',
                  'image/gif',
                ].includes(mediaType ?? '')
              ) {
                throw new UnsupportedFunctionalityError({
                  functionality: `OpenAI decision image media type: ${part.mediaType}`,
                });
              }
              return {
                type: 'input_image',
                image_url: `data:${mediaType};base64,${typeof part.data.data === 'string' ? part.data.data : convertUint8ArrayToBase64(part.data.data)}`,
              };
            }),
          },
        ],
        questions: Object.entries(questions).map(([name, question]) => {
          const instructions = toText(question.instructions);
          switch (question.type) {
            case 'boolean':
              return {
                type: 'predicate',
                name,
                instructions: [
                  instructions,
                  question.criteria?.true == null
                    ? undefined
                    : `Criteria for true:\n${toText(question.criteria.true)}`,
                  question.criteria?.false == null
                    ? undefined
                    : `Criteria for false:\n${toText(question.criteria.false)}`,
                ]
                  .filter(part => part !== undefined)
                  .join('\n\n'),
              };
            case 'choice':
              return {
                type: 'choice',
                name,
                instructions,
                choices: Object.entries(question.criteria).map(
                  ([value, description]) => ({
                    value,
                    ...(description == null
                      ? {}
                      : { description: toText(description) }),
                  }),
                ),
              };
            case 'score':
              return {
                type: 'score',
                name,
                instructions,
                levels: question.criteria.map((description, index) => ({
                  // Score criteria have no separate labels; indices identify each level.
                  label: String(index),
                  ...(description == null
                    ? {}
                    : { description: toText(description) }),
                })),
              };
          }
        }),
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
    });

    const answers = Object.fromEntries(
      response.answers.map((answer): [string, DecisionModelV4Answer] => {
        if (answer.type === 'refusal') {
          throw new InvalidResponseDataError({
            data: rawValue,
            message:
              answer.name === null
                ? 'OpenAI Decisions refused an unnamed question.'
                : `OpenAI Decisions refused question ${JSON.stringify(answer.name)}.`,
          });
        }
        if (answer.type === 'predicate') {
          return [
            answer.name,
            { type: 'boolean', probability: answer.probability },
          ];
        }
        const probabilities = Object.fromEntries(
          answer.probabilities.map(({ value, probability }) => [
            value,
            probability,
          ]),
        );
        if (Object.keys(probabilities).length !== answer.probabilities.length) {
          throw new InvalidResponseDataError({
            data: rawValue,
            message: 'Decisions returned duplicate probability values.',
          });
        }
        return [
          answer.name,
          answer.type === 'choice'
            ? { type: 'choice', choice: answer.choice, probabilities }
            : { type: 'score', score: answer.score, probabilities },
        ];
      }),
    );

    const names = response.answers.map(answer => answer.name);
    if (
      names.length !== Object.keys(questions).length ||
      new Set(names).size !== names.length ||
      names.some(
        name =>
          typeof name !== 'string' ||
          !Object.prototype.hasOwnProperty.call(questions, name),
      )
    ) {
      throw new InvalidResponseDataError({
        data: rawValue,
        message: 'Decisions must return exactly one answer for every question.',
      });
    }

    return {
      answers,
      usage:
        response.usage == null
          ? undefined
          : {
              inputTokens: response.usage.input_tokens ?? undefined,
              outputTokens: response.usage.output_tokens ?? undefined,
            },
      // The Decisions API reports probabilities and scores to two decimal places.
      rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
      warnings: Object.keys(providerOptions?.openai ?? {})
        .filter(option => option !== 'safetyIdentifier')
        .map(option => ({
          type: 'unsupported',
          feature: `providerOptions.openai.${option}`,
        })),
      providerMetadata: {
        openai: {
          ...(response.usage == null ? {} : { usage: response.usage }),
          confidence: Object.fromEntries(
            response.answers.flatMap(answer =>
              (answer.type === 'choice' || answer.type === 'score') &&
              answer.confidence != null
                ? [[answer.name, answer.confidence]]
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

function toText(input: DecisionModelV4Input): string {
  return typeof input === 'string' ? input : JSON.stringify(input);
}
