import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4Reasoning,
  LanguageModelV4Source,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Text,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResult,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  createToolNameMapping,
  generateId,
  injectJsonInstructionIntoMessages,
  isCustomReasoning,
  mapReasoningToProviderEffort,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  StreamingToolCallTracker,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  convertMistralUsage,
  mistralUsageSchema,
  type MistralUsage,
} from './convert-mistral-usage';
import { convertToMistralConversationInputs } from './convert-to-mistral-conversation-inputs';
import {
  mistralLanguageModelConversationOptions,
  type MistralConversationModelId,
} from './mistral-conversation-language-model-options';
import { mistralFailedResponseHandler } from './mistral-error';
import {
  mistralProviderToolNames,
  prepareConversationTools,
} from './mistral-conversation-prepare-tools';

type MistralConversationConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  generateId?: () => string;
};

// https://api.mistral.ai/v1/models (2026-10-06)
const reasoningEffortModelIds = new Set<MistralConversationModelId>([
  'glm-5-2',
  'labs-leanstral-1-5',
  'labs-leanstral-1-5-1',
  'magistral-medium-latest',
  'magistral-small-latest',
  'mistral-large-4',
  'mistral-large-4-0',
  'mistral-medium',
  'mistral-medium-2604',
  'mistral-medium-3',
  'mistral-medium-3-5',
  'mistral-medium-3.5',
  'mistral-medium-latest',
  'mistral-small-2603',
  'mistral-small-latest',
  'mistral-vibe-cli-fast',
  'mistral-vibe-cli-latest',
  'mistral-vibe-cli-with-tools',
  'zai-glm-5-2',
]);

export class MistralConversationLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  readonly modelId: MistralConversationModelId;

  private readonly config: MistralConversationConfig;
  private readonly generateId: () => string;

  static [WORKFLOW_SERIALIZE](model: MistralConversationLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MistralConversationModelId;
    config: MistralConversationConfig;
  }) {
    return new MistralConversationLanguageModel(
      options.modelId,
      options.config,
    );
  }

  constructor(
    modelId: MistralConversationModelId,
    config: MistralConversationConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
    this.generateId = config.generateId ?? generateId;
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
    reasoning,
    stopSequences,
    responseFormat,
    seed,
    providerOptions,
    tools,
    toolChoice,
  }: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

    const options =
      (await parseProviderOptions({
        provider: 'mistral',
        providerOptions,
        schema: mistralLanguageModelConversationOptions,
      })) ?? {};

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }

    const supportsReasoningEffort = reasoningEffortModelIds.has(this.modelId);

    let resolvedReasoningEffort: string | undefined;
    if (supportsReasoningEffort) {
      resolvedReasoningEffort =
        options.reasoningEffort ??
        (isCustomReasoning(reasoning)
          ? reasoning === 'none'
            ? 'none'
            : mapReasoningToProviderEffort({
                reasoning,
                effortMap: {
                  minimal: 'high',
                  low: 'high',
                  medium: 'high',
                  high: 'high',
                  xhigh: 'high',
                  max: 'high',
                },
                warnings,
              })
          : undefined);
    } else if (isCustomReasoning(reasoning)) {
      warnings.push({
        type: 'unsupported',
        feature: 'reasoning',
        details: 'This model does not support reasoning configuration.',
      });
    }

    const structuredOutputs = options.structuredOutputs ?? true;
    const strictJsonSchema = options.strictJsonSchema ?? false;

    // For Mistral we need to instruct the model when using JSON Object mode.
    // https://docs.mistral.ai/capabilities/structured-output/structured_output_overview/
    if (
      responseFormat?.type === 'json' &&
      (!structuredOutputs || responseFormat.schema == null)
    ) {
      prompt = injectJsonInstructionIntoMessages({
        messages: prompt,
        schema: responseFormat.schema,
      });
    }

    const baseArgs = {
      // standardized settings:
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      ...(frequencyPenalty != null
        ? { frequency_penalty: frequencyPenalty }
        : {}),
      ...(presencePenalty != null ? { presence_penalty: presencePenalty } : {}),
      stop: stopSequences,
      random_seed: seed,
      reasoning_effort: resolvedReasoningEffort,

      // response format:
      response_format:
        responseFormat?.type === 'json'
          ? structuredOutputs && responseFormat?.schema != null
            ? {
                type: 'json_schema',
                json_schema: {
                  schema: responseFormat.schema,
                  strict: strictJsonSchema,
                  name: responseFormat.name ?? 'response',
                  description: responseFormat.description,
                },
              }
            : { type: 'json_object' }
          : undefined,
    };

    const {
      tools: mistralTools,
      toolChoice: mistralToolChoice,
      toolWarnings,
    } = prepareConversationTools({ tools, toolChoice });

    for (const [feature, value] of Object.entries({
      safePrompt: options.safePrompt,
      documentImageLimit: options.documentImageLimit,
      documentPageLimit: options.documentPageLimit,
      promptCacheKey: options.promptCacheKey,
      parallelToolCalls: options.parallelToolCalls,
    })) {
      if (value != null) {
        warnings.push({
          type: 'unsupported',
          feature,
          details: 'Not supported by the Mistral Conversations API.',
        });
      }
    }

    return {
      args: {
        model: this.modelId,
        store: false,
        ...convertToMistralConversationInputs(
          prompt,
          createToolNameMapping({
            tools,
            providerToolNames: mistralProviderToolNames,
          }),
        ),
        tools: mistralTools,
        completion_args: { ...baseArgs, tool_choice: mistralToolChoice },
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args: body, warnings } = await this.getArgs(options);

    const {
      value: response,
      rawValue: rawResponse,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/conversations`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        mistralConversationResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const converter = createContentConverter({
      tools: options.tools,
      generateId: this.generateId,
    });
    const content: LanguageModelV4Content[] = [];
    let hasFunctionCalls = false;
    let modelId: string | undefined;

    for (const output of response.outputs) {
      switch (output.type) {
        case 'tool.execution':
          content.push(...converter.convertTool(output));
          break;
        case 'function.call':
          hasFunctionCalls = true;
          content.push({
            type: 'tool-call',
            toolCallId: output.tool_call_id,
            toolName: output.name,
            input:
              typeof output.arguments === 'string'
                ? output.arguments
                : JSON.stringify(output.arguments),
          });
          break;
        case 'message.output':
          modelId = output.model ?? modelId;
          for (const chunk of typeof output.content === 'string'
            ? [{ type: 'text' as const, text: output.content }]
            : output.content) {
            content.push(...converter.convertChunk(chunk));
          }
          break;
      }
    }

    return {
      content,
      finishReason: {
        unified: hasFunctionCalls ? 'tool-calls' : 'stop',
        raw: undefined,
      },
      usage: convertMistralUsage(response.usage),
      request: { body },
      response: {
        id: response.conversation_id,
        modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings } = await this.getArgs(options);
    const body = { ...args, stream: true };

    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/conversations`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        mistralConversationChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const converter = createContentConverter({
      tools: options.tools,
      generateId: this.generateId,
    });
    const executions = new Map<
      string,
      { name: string; arguments: string; function?: string | null }
    >();
    let toolCallTracker: StreamingToolCallTracker;
    let active: { id: string; type: 'text' | 'reasoning' } | undefined;
    let usage: MistralUsage | undefined;
    let hasFunctionCalls = false;
    let hasError = false;
    let isDone = false;
    let hasModelId = false;
    const closeContent = (
      controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
    ) => {
      if (active != null) {
        controller.enqueue({
          type: active.type === 'text' ? 'text-end' : 'reasoning-end',
          id: active.id,
        });
        active = undefined;
      }
    };

    const generateId = this.generateId;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof mistralConversationChunkSchema>>,
          LanguageModelV4StreamPart
        >({
          start(controller) {
            toolCallTracker = new StreamingToolCallTracker(controller, {
              generateId,
            });
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              hasError = true;
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }
            const event = chunk.value;
            switch (event.type) {
              case 'conversation.response.started':
                controller.enqueue({
                  type: 'response-metadata',
                  id: event.conversation_id,
                  ...(event.created_at != null
                    ? { timestamp: new Date(event.created_at) }
                    : {}),
                });
                break;
              case 'conversation.response.done':
                usage = event.usage ?? undefined;
                isDone = true;
                break;
              case 'conversation.response.error':
                hasError = true;
                controller.enqueue({ type: 'error', error: event });
                break;
              case 'message.output.delta': {
                if (!hasModelId && event.model != null) {
                  hasModelId = true;
                  controller.enqueue({
                    type: 'response-metadata',
                    modelId: event.model,
                  });
                }
                for (const part of converter.convertChunk(
                  typeof event.content === 'string'
                    ? { type: 'text', text: event.content }
                    : event.content,
                )) {
                  if (part.type === 'text' || part.type === 'reasoning') {
                    const id = `${event.id}-${event.content_index ?? 0}`;
                    if (active?.id !== id || active.type !== part.type) {
                      closeContent(controller);
                      active = { id, type: part.type };
                      controller.enqueue({
                        type:
                          part.type === 'text'
                            ? 'text-start'
                            : 'reasoning-start',
                        id,
                      });
                    }
                    controller.enqueue({
                      type:
                        part.type === 'text' ? 'text-delta' : 'reasoning-delta',
                      id,
                      delta: part.text,
                    });
                  } else if (part.type === 'source') {
                    controller.enqueue(part);
                  }
                }
                break;
              }
              case 'function.call.delta':
                closeContent(controller);
                hasFunctionCalls = true;
                toolCallTracker.processDelta({
                  id: event.tool_call_id,
                  index: event.output_index,
                  function: { name: event.name, arguments: event.arguments },
                });
                break;
              case 'tool.execution.started':
              case 'tool.execution.delta': {
                closeContent(controller);
                const execution = executions.get(event.id);
                if (execution == null) {
                  executions.set(event.id, {
                    name: event.name,
                    arguments: event.arguments,
                    function: event.function,
                  });
                  controller.enqueue({
                    type: 'tool-input-start',
                    id: event.id,
                    toolName: converter.toolNameMapping.toCustomToolName(
                      event.name,
                    ),
                    providerExecuted: true,
                  });
                } else {
                  execution.arguments += event.arguments;
                }
                break;
              }
              case 'tool.execution.done': {
                const execution = executions.get(event.id);
                if (execution == null) {
                  hasError = true;
                  controller.enqueue({
                    type: 'error',
                    error: new Error(
                      `Missing tool execution start for ${event.id}`,
                    ),
                  });
                  break;
                }
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: event.id,
                  delta: JSON.stringify({ arguments: execution.arguments }),
                });
                controller.enqueue({ type: 'tool-input-end', id: event.id });
                for (const part of converter.convertTool({
                  type: 'tool.execution',
                  id: event.id,
                  name: execution.name,
                  arguments: execution.arguments,
                  function: event.function ?? execution.function,
                  info: event.info,
                })) {
                  controller.enqueue(part);
                }
                executions.delete(event.id);
                break;
              }
            }
          },

          flush(controller) {
            closeContent(controller);
            toolCallTracker.flush();
            controller.enqueue({
              type: 'finish',
              finishReason: {
                unified:
                  hasError || !isDone || executions.size > 0
                    ? 'error'
                    : hasFunctionCalls
                      ? 'tool-calls'
                      : 'stop',
                raw: undefined,
              },
              usage: convertMistralUsage(usage),
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

function createContentConverter({
  tools,
  generateId,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  generateId: () => string;
}) {
  const toolNameMapping = createToolNameMapping({
    tools,
    providerToolNames: mistralProviderToolNames,
  });
  const sourceUrls = new Set<string>();

  return {
    toolNameMapping,
    convertChunk(
      chunk: z.infer<typeof mistralConversationContentSchema>,
    ): Array<
      LanguageModelV4Text | LanguageModelV4Reasoning | LanguageModelV4Source
    > {
      switch (chunk.type) {
        case 'text':
          return chunk.text.length > 0
            ? [{ type: 'text', text: chunk.text }]
            : [];
        case 'thinking': {
          const text = chunk.thinking.map(part => part.text).join('');
          return text.length > 0 ? [{ type: 'reasoning', text }] : [];
        }
        case 'tool_reference':
          if (chunk.url == null || sourceUrls.has(chunk.url)) {
            return [];
          }
          const id = generateId();
          sourceUrls.add(chunk.url);
          return [
            {
              type: 'source',
              sourceType: 'url',
              id,
              url: chunk.url,
              title: chunk.title,
            },
          ];
      }
    },
    convertTool(
      output: z.infer<typeof mistralConversationToolExecutionSchema>,
    ): [LanguageModelV4ToolCall, LanguageModelV4ToolResult] {
      const toolName = toolNameMapping.toCustomToolName(output.name);
      return [
        {
          type: 'tool-call',
          toolCallId: output.id,
          toolName,
          input: JSON.stringify({ arguments: output.arguments }),
          providerExecuted: true,
          providerMetadata: {
            mistral: {
              type: 'tool.execution',
              name: output.name,
              ...(output.function != null ? { function: output.function } : {}),
            },
          },
        },
        {
          type: 'tool-result',
          toolCallId: output.id,
          toolName,
          result: { ...(output.info != null ? { info: output.info } : {}) },
        },
      ];
    },
  };
}

const mistralConversationContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('thinking'),
    thinking: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  }),
  z.object({
    type: z.literal('tool_reference'),
    tool: z.string(),
    title: z.string(),
    url: z.string().nullish(),
  }),
]);
const mistralConversationMessageContentSchema = z.union([
  z.string(),
  z.array(mistralConversationContentSchema),
]);
const mistralConversationToolExecutionSchema = z.object({
  type: z.literal('tool.execution'),
  id: z.string(),
  name: z.string(),
  arguments: z.string(),
  function: z.string().nullish(),
  info: z.record(z.string(), z.json()).nullish(),
});
const mistralConversationFunctionCallSchema = z.object({
  type: z.literal('function.call'),
  tool_call_id: z.string(),
  name: z.string(),
  arguments: z.union([z.string(), z.record(z.string(), z.json())]),
});
const mistralConversationUsageSchema = mistralUsageSchema.extend({
  prompt_tokens: z.number().default(0),
  completion_tokens: z.number().default(0),
  total_tokens: z.number().default(0),
});
const mistralConversationResponseSchema = z.object({
  conversation_id: z.string(),
  outputs: z.array(
    z.discriminatedUnion('type', [
      mistralConversationToolExecutionSchema,
      mistralConversationFunctionCallSchema,
      z.object({
        type: z.literal('message.output'),
        content: mistralConversationMessageContentSchema,
        model: z.string().nullish(),
      }),
    ]),
  ),
  usage: mistralConversationUsageSchema.nullish(),
});
const mistralConversationChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('conversation.response.started'),
    conversation_id: z.string(),
    created_at: z.string().nullish(),
  }),
  z.object({
    type: z.literal('conversation.response.done'),
    usage: mistralConversationUsageSchema.nullish(),
  }),
  z.object({
    type: z.literal('conversation.response.error'),
    message: z.string(),
    code: z.number(),
  }),
  z.object({
    type: z.literal('message.output.delta'),
    id: z.string(),
    content_index: z.number().nullish(),
    content: z.union([z.string(), mistralConversationContentSchema]),
    model: z.string().nullish(),
  }),
  z.object({
    type: z.literal('function.call.delta'),
    tool_call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
    output_index: z.number().nullish(),
  }),
  z.object({
    type: z.enum(['tool.execution.started', 'tool.execution.delta']),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
    function: z.string().nullish(),
  }),
  z.object({
    type: z.literal('tool.execution.done'),
    id: z.string(),
    name: z.string(),
    function: z.string().nullish(),
    info: z.record(z.string(), z.json()).nullish(),
  }),
]);
