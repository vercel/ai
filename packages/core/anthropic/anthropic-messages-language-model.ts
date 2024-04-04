import { z } from 'zod';
import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1FunctionTool,
  LanguageModelV1FunctionToolCall,
  LanguageModelV1StreamPart,
  ParseResult,
  UnsupportedFunctionalityError,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '../spec';
import { anthropicFailedResponseHandler } from './anthropic-error';
import { AnthropicMessage } from './anthropic-messages-prompt';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';
import { generateToolsHeader } from './generate-tools-header';
import { mapAnthropicStopReason } from './map-anthropic-stop-reason';
import { parseToolCalls } from './parse-tool-calls';

type AnthropicMessagesConfig = {
  provider: string;
  baseUrl: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
};

export class AnthropicMessagesLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'tool';

  readonly modelId: AnthropicMessagesModelId;
  readonly settings: AnthropicMessagesSettings;

  private readonly config: AnthropicMessagesConfig;

  constructor(
    modelId: AnthropicMessagesModelId,
    settings: AnthropicMessagesSettings,
    config: AnthropicMessagesConfig,
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

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    const messagesPrompt = convertToAnthropicMessagesPrompt({
      provider: this.provider,
      prompt,
    });

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      top_k: this.settings.topK,

      // standardized settings:
      max_tokens: maxTokens ?? 4096, // 4096: max model output tokens
      temperature, // uses 0..1 scale
      top_p: topP,

      // prompt:
      system: messagesPrompt.system,
      messages: messagesPrompt.messages,
    };

    switch (type) {
      case 'regular': {
        const tools = mode.tools;

        if (tools == null || tools.length === 0) {
          return {
            args: baseArgs,
            warnings,
            prefix: '',
          };
        }

        return {
          args: injectToolsHeader({
            baseArgs,
            tools,
            provider: this.provider,
          }),
          warnings,
          prefix: '',
        };
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-json mode',
          provider: this.provider,
        });
      }

      case 'object-tool': {
        const injected = injectToolsHeader({
          baseArgs,
          tools: [mode.tool],
          provider: this.provider,
        });

        // provide the start of the assistant message to force the function call:
        const prefix =
          `<function_calls>\n<invoke>\n` +
          `<tool_name>${mode.tool.name}</tool_name>\n` +
          `<parameters>`;

        return {
          args: {
            ...injected,
            messages: [
              ...injected.messages,
              { role: 'assistant', content: prefix },
            ],
          },
          warnings,
          prefix,
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
    const { args, warnings, prefix } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/messages`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      abortSignal: options.abortSignal,
    });

    const finishReason = mapAnthropicStopReason({
      stopReason: response.stop_reason,
      stopSequence: response.stop_sequence,
    });

    let text = prefix + response.content.map(({ text }) => text).join('');
    let toolCalls: LanguageModelV1FunctionToolCall[] | undefined = undefined;

    if (
      finishReason === 'tool-calls' &&
      ((options.mode.type === 'regular' && options.mode.tools != null) ||
        options.mode.type === 'object-tool')
    ) {
      const parsedToolCalls = parseToolCalls({
        text,
        tools:
          options.mode.type === 'regular'
            ? options.mode.tools!
            : [options.mode.tool],
        generateId: this.config.generateId,
      });

      text = parsedToolCalls.modifiedText;
      toolCalls = parsedToolCalls.toolCalls;
    }

    const { messages, system, ...rawSettings } = args;

    return {
      text,
      toolCalls,
      finishReason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      rawCall: {
        rawPrompt: { system, messages },
        rawSettings,
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/messages`,
      headers: this.config.headers(),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(chunkSchema),
      abortSignal: options.abortSignal,
    });

    const { messages, system, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'other';
    const usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    const generateId = this.config.generateId;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof chunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            switch (value.type) {
              case 'ping':
              case 'content_block_start':
              case 'content_block_stop': {
                return; // ignored
              }

              case 'content_block_delta': {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: value.delta.text,
                });
                return;
              }

              case 'message_start': {
                usage.promptTokens = value.message.usage.input_tokens;
                usage.completionTokens = value.message.usage.output_tokens;
                return;
              }

              case 'message_delta': {
                usage.completionTokens = value.usage.output_tokens;
                finishReason = mapAnthropicStopReason({
                  stopReason: value.delta.stop_reason,
                  stopSequence: value.delta.stop_sequence,
                });
                return;
              }

              case 'message_stop': {
                controller.enqueue({ type: 'finish', finishReason, usage });
                return;
              }

              default: {
                const _exhaustiveCheck: never = value;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          },
        }),
      ),
      rawCall: {
        rawPrompt: { system, messages },
        rawSettings,
      },
      warnings,
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const responseSchema = z.object({
  type: z.literal('message'),
  content: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
  ),
  stop_reason: z.string().optional().nullable(),
  stop_sequence: z.string().optional().nullable(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const chunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    message: z.object({
      usage: z.object({
        input_tokens: z.number(),
        output_tokens: z.number(),
      }),
    }),
  }),
  z.object({
    type: z.literal('content_block_start'),
    index: z.number(),
    content_block: z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
  }),
  z.object({
    type: z.literal('content_block_delta'),
    index: z.number(),
    delta: z.object({
      type: z.literal('text_delta'),
      text: z.string(),
    }),
  }),
  z.object({
    type: z.literal('content_block_stop'),
    index: z.number(),
  }),
  z.object({
    type: z.literal('message_delta'),
    delta: z.object({
      stop_reason: z.string().optional().nullable(),
      stop_sequence: z.string().optional().nullable(),
    }),
    usage: z.object({ output_tokens: z.number() }),
  }),
  z.object({
    type: z.literal('message_stop'),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);

function injectToolsHeader({
  baseArgs,
  tools,
  provider,
}: {
  baseArgs: {
    model: AnthropicMessagesModelId;
    top_k: number | undefined;
    max_tokens: number;
    temperature: number | undefined;
    top_p: number | undefined;
    system: string | undefined;
    messages: AnthropicMessage[];
  };
  tools: LanguageModelV1FunctionTool[];
  provider: string;
}) {
  // inject a tools header into the system message:
  const toolsHeader = generateToolsHeader({ tools, provider });

  const system =
    baseArgs.system != null
      ? `${baseArgs.system}\n\n${toolsHeader}`
      : toolsHeader;

  return {
    ...baseArgs,
    system,
    stop_sequences: ['</function_calls>'],
  };
}
