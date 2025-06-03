import {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToXaiChatMessages } from './convert-to-xai-chat-messages';
import { getResponseMetadata } from './get-response-metadata';
import { mapXaiFinishReason } from './map-xai-finish-reason';
import { XaiChatModelId, xaiProviderOptions } from './xai-chat-options';
import { xaiFailedResponseHandler } from './xai-error';
import { prepareTools } from './xai-prepare-tools';

type XaiChatConfig = {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class XaiChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: XaiChatModelId;

  private readonly config: XaiChatConfig;

  constructor(modelId: XaiChatModelId, config: XaiChatConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'application/pdf': [/^https:\/\/.*$/],
  };

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    seed,
    responseFormat,
    providerOptions,
    tools,
    toolChoice,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    // parse xai-specific provider options
    const options =
      (await parseProviderOptions({
        provider: 'xai',
        providerOptions,
        schema: xaiProviderOptions,
      })) ?? {};

    // check for unsupported parameters (following mistral pattern)
    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

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

    if (stopSequences != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'stopSequences',
      });
    }

    if (
      responseFormat != null &&
      responseFormat.type === 'json' &&
      responseFormat.schema != null
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format schema is not supported',
      });
    }

    // convert ai sdk messages to xai format
    const { messages, warnings: messageWarnings } =
      convertToXaiChatMessages(prompt);
    warnings.push(...messageWarnings);

    // prepare tools for xai
    const {
      tools: xaiTools,
      toolChoice: xaiToolChoice,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
    });
    warnings.push(...toolWarnings);

    const baseArgs = {
      // model id
      model: this.modelId,

      // standard generation settings
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      seed,

      // response format
      response_format:
        responseFormat?.type === 'json' ? { type: 'json_object' } : undefined,

      // messages in xai format
      messages,

      // tools in xai format
      tools: xaiTools,
      tool_choice: xaiToolChoice,
    };

    return {
      args: baseArgs,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args: body, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
    const content: Array<LanguageModelV2Content> = [];

    // extract text content
    if (choice.message.content != null && choice.message.content.length > 0) {
      let text = choice.message.content;

      // when there is a trailing assistant message, xai might send the
      // content of that message again. we skip this repeated content to
      // avoid duplication, e.g. in continuation mode. (following mistral pattern)
      const lastMessage = body.messages[body.messages.length - 1];
      if (
        lastMessage.role === 'assistant' &&
        typeof lastMessage.content === 'string' &&
        text.startsWith(lastMessage.content)
      ) {
        text = text.slice(lastMessage.content.length);
      }

      if (text.length > 0) {
        content.push({ type: 'text', text });
      }
    }

    // extract tool calls
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallType: 'function',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          args: toolCall.function.arguments,
        });
      }
    }

    return {
      content,
      finishReason: mapXaiFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);
    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler:
        createEventSourceResponseHandler(xaiChatChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    let chunkNumber = 0;
    let trimLeadingSpace = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof xaiChatChunkSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            chunkNumber++;
            const value = chunk.value;

            // emit response metadata on first chunk
            if (chunkNumber === 1) {
              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });
            }

            // update usage if present
            if (value.usage != null) {
              usage.inputTokens = value.usage.prompt_tokens;
              usage.outputTokens = value.usage.completion_tokens;
              usage.totalTokens = value.usage.total_tokens;
            }

            const choice = value.choices[0];

            // update finish reason if present
            if (choice?.finish_reason != null) {
              finishReason = mapXaiFinishReason(choice.finish_reason);
            }

            // exit if no delta to process
            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            // process text content
            if (delta.content != null && delta.content.length > 0) {
              let textContent = delta.content;

              // when there is a trailing assistant message, xai will send the
              // content of that message again. we skip this repeated content to
              // avoid duplication, e.g. in continuation mode.
              if (chunkNumber <= 2) {
                const lastMessage = body.messages[body.messages.length - 1];

                if (
                  lastMessage.role === 'assistant' &&
                  typeof lastMessage.content === 'string' &&
                  textContent === lastMessage.content.trimEnd()
                ) {
                  // XAI moves the trailing space from the prefix to the next chunk.
                  // We trim the leading space to avoid duplication.
                  if (textContent.length < lastMessage.content.length) {
                    trimLeadingSpace = true;
                  }

                  // skip the repeated content:
                  return;
                }
              }

              controller.enqueue({
                type: 'text',
                text: trimLeadingSpace ? textContent.trimStart() : textContent,
              });

              trimLeadingSpace = false;
            }

            // process tool calls
            if (delta.tool_calls != null) {
              for (const toolCall of delta.tool_calls) {
                // xai tool calls come in one piece (like mistral)
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCall.function.arguments,
                });
                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: toolCall.id,
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
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

// XAI API Response Schemas
const xaiUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

const xaiChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant'),
        content: z.string().nullish(),
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
          .nullish(),
      }),
      index: z.number(),
      finish_reason: z.string().nullish(),
    }),
  ),
  object: z.literal('chat.completion'),
  usage: xaiUsageSchema,
});

const xaiChatChunkSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(['assistant']).optional(),
        content: z.string().nullish(),
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
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
      index: z.number(),
    }),
  ),
  usage: xaiUsageSchema.nullish(),
});
