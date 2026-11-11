import {
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4Input as DecisionModelV4Input,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { googleDecisionResponseSchema } from './google-decision-api';
import { googleFailedResponseHandler } from './google-error';

export type GoogleDecisionModelId = 'gemini-decision-1' | (string & {});

type GoogleDecisionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class GoogleDecisionModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

  constructor(
    readonly modelId: GoogleDecisionModelId,
    private readonly config: GoogleDecisionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: GoogleDecisionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GoogleDecisionModelId;
    config: GoogleDecisionModelConfig;
  }) {
    return new GoogleDecisionModel(options.modelId, options.config);
  }

  /** @deprecated Use `doDecide` instead. */
  doEvaluate(options: Parameters<DecisionModelV4['doDecide']>[0]) {
    return this.doDecide(options);
  }

  async doDecide({
    state,
    questions,
    maxOutputTokens,
    reasoning,
    abortSignal,
    headers,
    providerOptions,
  }: Parameters<DecisionModelV4['doDecide']>[0]): Promise<
    Awaited<ReturnType<DecisionModelV4['doDecide']>>
  > {
    abortSignal?.throwIfAborted();
    const entries = Object.entries(questions);
    if (entries.length === 0) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message: 'Google Decisions requires at least one question.',
      });
    }

    const requestQuestions = Object.fromEntries(
      entries.map(([id, question]) => {
        if (question.type === 'box') {
          throw new DecisionUnsupportedQuestionTypeError({
            questionId: id,
            questionType: question.type,
            provider: this.provider,
            modelId: this.modelId,
          });
        }
        if (question.instructions == null) {
          throw new InvalidArgumentError({
            argument: `questions.${id}.instructions`,
            message:
              'Google Decisions requires instructions for every question.',
          });
        }
        const instructions = toText(question.instructions);
        if (question.type === 'boolean') {
          return [
            id,
            {
              type: 'noul',
              instructions,
              criteria:
                question.criteria == null
                  ? undefined
                  : {
                      true_description:
                        question.criteria.true == null
                          ? undefined
                          : toText(question.criteria.true),
                      false_description:
                        question.criteria.false == null
                          ? undefined
                          : toText(question.criteria.false),
                    },
            },
          ];
        }
        const count = Object.keys(question.criteria).length;
        if (count < 2 || count > 255) {
          throw new InvalidArgumentError({
            argument: `questions.${id}.criteria`,
            message:
              'Google Decisions requires 2 to 255 options or score levels.',
          });
        }
        if (
          question.type === 'score' &&
          question.criteria.some(level => level == null || level === '')
        ) {
          throw new InvalidArgumentError({
            argument: `questions.${id}.criteria`,
            message:
              'Google Decisions requires non-empty score level descriptions.',
          });
        }
        return [
          id,
          {
            type: question.type,
            instructions,
            criteria:
              question.type === 'choice'
                ? Object.fromEntries(
                    Object.entries(question.criteria).map(([key, value]) => [
                      key,
                      value == null ? null : toText(value),
                    ]),
                  )
                : question.criteria.map(level => toText(level!)),
          },
        ];
      }),
    );

    const input = state.map(part => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'json')
        return { type: 'text', text: JSON.stringify(part.value) };

      const type =
        part.mediaType === 'application/pdf'
          ? 'document'
          : part.mediaType.split('/')[0];
      if (!['image', 'audio', 'video', 'document'].includes(type)) {
        throw new UnsupportedFunctionalityError({
          functionality: `Google decision file media type: ${part.mediaType}`,
        });
      }
      if (part.data.type !== 'data' && part.data.type !== 'url') {
        throw new UnsupportedFunctionalityError({
          functionality: `Google decision file input: ${part.data.type}`,
        });
      }
      return {
        type,
        mime_type: part.mediaType,
        ...(part.data.type === 'url'
          ? { uri: part.data.url.toString() }
          : {
              data:
                typeof part.data.data === 'string'
                  ? part.data.data
                  : convertUint8ArrayToBase64(part.data.data),
            }),
      };
    });

    const {
      value: response,
      rawValue,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/decisions`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: { model: this.modelId, input, questions: requestQuestions },
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleDecisionResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });
    abortSignal?.throwIfAborted();

    const blocked = response.prompt_feedback?.block_reason != null;
    const responseAnswers = response.answers;
    if (
      !blocked &&
      (responseAnswers == null ||
        Object.keys(responseAnswers).length !== entries.length ||
        entries.some(
          ([id]) => !Object.prototype.hasOwnProperty.call(responseAnswers, id),
        ))
    ) {
      throw new InvalidResponseDataError({
        data: rawValue,
        message:
          'Google Decisions must return exactly one answer for every question.',
      });
    }

    const answers = Object.fromEntries(
      entries.map(([id, question]): [string, DecisionModelV4Answer] => {
        if (blocked) return [id, { type: 'refusal' }];
        const answer = responseAnswers![id];
        if (question.type === 'boolean' && answer.type === 'noul') {
          return [id, { type: 'boolean', probability: answer.noul }];
        }
        if (
          question.type === 'choice' &&
          answer.type === 'choice' &&
          Object.prototype.hasOwnProperty.call(question.criteria, answer.choice)
        ) {
          return [
            id,
            {
              type: 'choice',
              choice: answer.choice,
              probabilities: answer.probabilities,
            },
          ];
        }
        if (
          question.type === 'score' &&
          answer.type === 'score' &&
          answer.score >= 0 &&
          answer.score <= question.criteria.length - 1
        ) {
          return [
            id,
            {
              type: 'score',
              score: answer.score,
              probabilities: answer.probabilities,
            },
          ];
        }
        throw new InvalidResponseDataError({
          data: rawValue,
          message: `Google Decisions returned an invalid answer for question "${id}".`,
        });
      }),
    );

    return {
      answers,
      usage:
        response.usage == null
          ? undefined
          : {
              inputTokens: response.usage.total_input_tokens ?? undefined,
              outputTokens: response.usage.total_output_tokens ?? undefined,
            },
      warnings: [
        ...(maxOutputTokens != null
          ? [{ type: 'unsupported' as const, feature: 'maxOutputTokens' }]
          : []),
        ...(reasoning != null
          ? [{ type: 'unsupported' as const, feature: 'reasoning' }]
          : []),
        ...Object.keys(providerOptions?.google ?? {}).map(option => ({
          type: 'unsupported' as const,
          feature: `providerOptions.google.${option}`,
        })),
      ],
      providerMetadata: {
        google: {
          ...(response.usage == null ? {} : { usage: response.usage }),
          ...(response.prompt_feedback == null
            ? {}
            : { promptFeedback: response.prompt_feedback }),
          confidence: Object.fromEntries(
            Object.entries(responseAnswers ?? {}).flatMap(([id, answer]) =>
              answer.confidence == null ? [] : [[id, answer.confidence]],
            ),
          ),
          legend: Object.fromEntries(
            Object.entries(responseAnswers ?? {}).flatMap(([id, answer]) =>
              answer.type === 'score' && answer.legend != null
                ? [[id, answer.legend]]
                : [],
            ),
          ),
        },
      },
      response: {
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function toText(input: DecisionModelV4Input): string {
  return typeof input === 'string' ? input : JSON.stringify(input);
}
