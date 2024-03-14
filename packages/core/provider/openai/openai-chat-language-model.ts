import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  LanguageModelV1,
  LanguageModelV1StreamPart,
  ParsedChunk,
  UnsupportedFunctionalityError,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  isParseableJson,
  postJsonToApi,
} from '../../ai-model-specification/index';
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';
import { openaiFailedResponseHandler } from './openai-error';

type Config<SETTINGS extends { id: string }> = {
  provider: string;
  baseUrl: string;
  apiKey: () => string;
  mapSettings: (settings: SETTINGS) => Record<string, unknown> & {
    model: string;
  };
};

export class OpenAIChatLanguageModel<SETTINGS extends { id: string }>
  implements LanguageModelV1
{
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'tool';

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
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;
    const messages = convertToOpenAIChatMessages(prompt);

    const baseArgs = {
      // model specific settings:
      ...this.config.mapSettings(this.settings),

      // standardized settings:
      // TODO standardize temperature, presencePenalty, frequencyPenalty scales
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      seed,

      // messages:
      messages,
    };

    switch (type) {
      case 'regular': {
        // when the tools array is empty, change it to undefined to prevent OpenAI errors:
        const tools = mode.tools?.length ? mode.tools : undefined;

        return {
          ...baseArgs,
          tools: tools?.map(tool => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        };
      }

      case 'object-json': {
        return {
          ...baseArgs,
          response_format: { type: 'json_object' },
        };
      }

      case 'object-tool': {
        return {
          ...baseArgs,
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [{ type: 'function', function: mode.tool }],
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
    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/chat/completions`,
      headers: {
        Authorization: `Bearer ${this.config.apiKey()}`,
      },
      body: {
        ...this.getArgs(options),
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openAIChatResponseSchema,
      ),
    });

    const message = response.choices[0].message;

    return {
      text: message.content ?? undefined,
      toolCalls: message.tool_calls?.map(toolCall => ({
        toolCallType: 'function',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        args: toolCall.function.arguments!,
      })),
      warnings: [],
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/chat/completions`,
      headers: {
        Authorization: `Bearer ${this.config.apiKey()}`,
      },
      body: {
        ...this.getArgs(options),
        stream: true,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiChatChunkSchema,
      ),
    });

    if (response == null) {
      throw new Error('no response content'); // TODO standardize, handling in postjson
    }

    const toolCalls: Array<{
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }> = [];

    return {
      warnings: [],
      stream: response.pipeThrough(
        new TransformStream<
          ParsedChunk<z.infer<typeof openaiChatChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (chunk.type === 'error') {
              controller.enqueue(chunk);
              return;
            }

            const value = chunk.value;

            if (value.choices?.[0]?.delta == null) {
              return;
            }

            const delta = value.choices[0].delta;

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                // new tool call, add to list
                if (toolCalls[index] == null) {
                  toolCalls[index] = toolCallDelta;
                  continue;
                }

                // existing tool call, merge
                const toolCall = toolCalls[index];

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? '';
                }

                // send delta
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallId: toolCall.id ?? '', // TODO empty?
                  toolName: toolCall.function?.name ?? '', // TODO empty?
                  argsTextDelta: toolCallDelta.function?.arguments ?? '', // TODO empty?
                });

                // check if tool call is complete
                if (
                  toolCall.function?.name == null ||
                  toolCall.function?.arguments == null ||
                  !isParseableJson(toolCall.function.arguments)
                ) {
                  continue;
                }

                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: toolCall.id ?? nanoid(),
                  toolName: toolCall.function.name,
                  args: toolCall.function.arguments,
                });
              }
            }
          },
        }),
      ),
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openAIChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant'),
        content: z.string().nullable(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .optional(),
      }),
      index: z.number(),
      finish_reason: z.string().optional().nullable(),
    }),
  ),
  object: z.literal('chat.completion'),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiChatChunkSchema = z.object({
  object: z.literal('chat.completion.chunk'),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(['assistant']).optional(),
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              index: z.number(),
              id: z.string().optional(),
              type: z.literal('function').optional(),
              function: z.object({
                name: z.string().optional(),
                arguments: z.string().optional(),
              }),
            }),
          )
          .optional(),
      }),
      finish_reason: z.string().nullable().optional(),
      index: z.number(),
    }),
  ),
});
