import { z } from 'zod';
import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  ParseResult,
  UnsupportedFunctionalityError,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '../spec';
import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import {
  GoogleGenerativeAIModelId,
  GoogleGenerativeAISettings,
} from './google-generative-ai-settings';
import { mapMistralFinishReason } from './map-mistral-finish-reason';
import { mistralFailedResponseHandler } from './mistral-error';
import { nanoid } from 'nanoid';

type GoogleGenerativeAIConfig = {
  provider: string;
  baseUrl: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
};

export class GoogleGenerativeAILanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';

  readonly modelId: GoogleGenerativeAIModelId;
  readonly settings: GoogleGenerativeAISettings;

  private readonly config: GoogleGenerativeAIConfig;

  constructor(
    modelId: GoogleGenerativeAIModelId,
    settings: GoogleGenerativeAISettings,
    config: GoogleGenerativeAIConfig,
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
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const warnings: LanguageModelV1CallWarning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      // TODO

      // standardized settings:
      // max_tokens: maxTokens,
      // temperature, // uses 0..1 scale
      // top_p: topP,
      // random_seed: seed,

      // messages:
      contents: convertToGoogleGenerativeAIMessages({
        provider: this.provider,
        prompt,
      }),
    };

    switch (type) {
      case 'regular': {
        // when the tools array is empty, change it to undefined to prevent OpenAI errors:
        const tools = mode.tools?.length ? mode.tools : undefined;

        return {
          args: {
            ...baseArgs,
            tools: tools?.map(tool => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          },
          warnings,
        };
      }

      case 'object-json': {
        return {
          args: {
            ...baseArgs,
            response_format: { type: 'json_object' },
          },
          warnings,
        };
      }

      case 'object-tool': {
        return {
          args: {
            ...baseArgs,
            tool_choice: 'any',
            tools: [{ type: 'function', function: mode.tool }],
          },
          warnings,
        };
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
    const { args, warnings } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/${this.modelId}:generateContent`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleGenerativeAIResponseSchema,
      ),
      abortSignal: options.abortSignal,
    });

    const { contents: rawPrompt, ...rawSettings } = args;
    const candidate = response.candidates[0];

    return {
      text: candidate.content.parts.map(part => part.text).join(''), // TODO undefined
      // toolCalls: candidate.message.tool_calls?.map(toolCall => ({
      //   toolCallType: 'function',
      //   toolCallId: nanoid(), // TODO this.config.generateId(),
      //   toolName: toolCall.function.name,
      //   args: toolCall.function.arguments!,
      // })),
      // finishReason: mapMistralFinishReason(candidate.finish_reason),
      finishReason: 'stop',
      usage: {
        promptTokens: 1, // TODO response.usage.prompt_tokens,
        completionTokens: 1, // TODO response.usage.completion_tokens,
      },
      rawCall: { rawPrompt, rawSettings },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/chat/completions`,
      headers: this.config.headers(),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        mistralChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
    });

    const { contents: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'other';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    const generateId = this.config.generateId;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof mistralChatChunkSchema>>,
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
              finishReason = mapMistralFinishReason(choice.finish_reason);
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              for (const toolCall of delta.tool_calls) {
                // mistral tool calls come in one piece

                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: generateId(),
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCall.function.arguments,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: generateId(),
                  toolName: toolCall.function.name,
                  args: toolCall.function.arguments,
                });
              }
            }
          },

          flush(controller) {
            controller.enqueue({ type: 'finish', finishReason, usage });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      warnings,
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const googleGenerativeAIResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        role: z.string(),
        parts: z.array(
          z.object({
            text: z.string(),
          }),
          // TODO other parts
        ),
      }),
    }),
  ),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const mistralChatChunkSchema = z.object({
  object: z.literal('chat.completion.chunk'),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(['assistant']).optional(),
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              function: z.object({ name: z.string(), arguments: z.string() }),
            }),
          )
          .optional()
          .nullable(),
      }),
      finish_reason: z.string().nullable().optional(),
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
