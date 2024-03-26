import { z } from 'zod';
import {
  LanguageModelV1,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  ParseResult,
  UnsupportedFunctionalityError,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  scale,
} from '../ai-model-specification';
import { convertToOpenAICompletionPrompt } from './convert-to-openai-completion-prompt';
import { mapOpenAIFinishReason } from './map-openai-finish-reason';
import {
  OpenAICompletionModelId,
  OpenAICompletionSettings,
} from './openai-completion-settings';
import { openaiFailedResponseHandler } from './openai-error';

type OpenAICompletionConfig = {
  provider: string;
  baseUrl: string;
  headers: () => Record<string, string | undefined>;
};
export class OpenAICompletionLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = undefined;

  readonly modelId: OpenAICompletionModelId;
  readonly settings: OpenAICompletionSettings;

  private readonly config: OpenAICompletionConfig;

  constructor(
    modelId: OpenAICompletionModelId,
    settings: OpenAICompletionSettings,
    config: OpenAICompletionConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    mode,
    inputFormat,
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const { prompt: completionPrompt, stopSequences } =
      convertToOpenAICompletionPrompt({
        prompt,
        inputFormat,
        provider: this.provider,
      });

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      echo: this.settings.echo,
      logit_bias: this.settings.logitBias,
      suffix: this.settings.suffix,
      user: this.settings.user,

      // standardized settings:
      max_tokens: maxTokens,
      temperature: scale({
        value: temperature,
        outputMin: 0,
        outputMax: 2,
      }),
      top_p: topP,
      frequency_penalty: scale({
        value: frequencyPenalty,
        inputMin: -1,
        inputMax: 1,
        outputMin: -2,
        outputMax: 2,
      }),
      presence_penalty: scale({
        value: presencePenalty,
        inputMin: -1,
        inputMax: 1,
        outputMin: -2,
        outputMax: 2,
      }),
      seed,

      // prompt:
      prompt: completionPrompt,

      // stop sequences:
      stop: stopSequences,
    };

    switch (type) {
      case 'regular': {
        if (mode.tools?.length) {
          throw new UnsupportedFunctionalityError({
            functionality: 'tools',
            provider: this.provider,
          });
        }

        return baseArgs;
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-json mode',
          provider: this.provider,
        });
      }

      case 'object-tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-tool mode',
          provider: this.provider,
        });
      }

      case 'object-grammar': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-grammar mode',
          provider: this.provider,
        });
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const args = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/completions`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openAICompletionResponseSchema,
      ),
      abortSignal: options.abortSignal,
    });

    const { prompt: rawPrompt, ...rawSettings } = args;
    const choice = response.choices[0];

    return {
      text: choice.text,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      },
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      rawCall: { rawPrompt, rawSettings },
      warnings: [],
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const args = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/completions`,
      headers: this.config.headers(),
      body: {
        ...this.getArgs(options),
        stream: true,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiCompletionChunkSchema,
      ),
      abortSignal: options.abortSignal,
    });

    const { prompt: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'other';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof openaiCompletionChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens,
              };
            }

            const choice = value.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAIFinishReason(choice.finish_reason);
            }

            if (choice?.text != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: choice.text,
              });
            }
          },

          flush(controller) {
            controller.enqueue({ type: 'finish', finishReason, usage });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      warnings: [],
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openAICompletionResponseSchema = z.object({
  choices: z.array(
    z.object({
      text: z.string(),
      finish_reason: z.string(),
    }),
  ),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiCompletionChunkSchema = z.object({
  object: z.literal('text_completion'),
  choices: z.array(
    z.object({
      text: z.string(),
      finish_reason: z
        .enum(['stop', 'length', 'content_filter'])
        .optional()
        .nullable(),
      index: z.number(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
    })
    .optional()
    .nullable(),
});
