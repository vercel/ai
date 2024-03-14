import { z } from 'zod';
import {
  LanguageModelV1,
  LanguageModelV1StreamPart,
  ParsedChunk,
  UnsupportedFunctionalityError,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  scale,
} from '../../ai-model-specification';
import { convertToOpenAICompletionPrompt } from './convert-to-openai-completion-prompt';
import { openaiFailedResponseHandler } from './openai-error';

type Config<SETTINGS extends { id: string }> = {
  provider: string;
  baseUrl: string;
  apiKey: () => string;
  mapSettings: (settings: SETTINGS) => Record<string, unknown> & {
    model: string;
  };
};

export class OpenAICompletionLanguageModel<SETTINGS extends { id: string }>
  implements LanguageModelV1
{
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = undefined;

  readonly settings: SETTINGS;

  private readonly config: Config<SETTINGS>;

  constructor(settings: SETTINGS, config: Config<SETTINGS>) {
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  get modelId(): string {
    return this.settings.id;
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
      // model specific settings:
      ...this.config.mapSettings(this.settings),

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
    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/completions`,
      headers: {
        Authorization: `Bearer ${this.config.apiKey()}`,
      },
      body: {
        ...this.getArgs(options),
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openAICompletionResponseSchema,
      ),
    });

    return {
      text: response.choices[0].text,
      warnings: [],
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/completions`,
      headers: {
        Authorization: `Bearer ${this.config.apiKey()}`,
      },
      body: {
        ...this.getArgs(options),
        stream: true,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiCompletionChunkSchema,
      ),
    });

    return {
      warnings: [],
      stream: response.pipeThrough(
        new TransformStream<
          ParsedChunk<z.infer<typeof openaiCompletionChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (chunk.type === 'error') {
              controller.enqueue(chunk);
              return;
            }

            const value = chunk.value;

            if (value.choices?.[0]?.text != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: value.choices[0].text,
              });
            }
          },
        }),
      ),
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
});
