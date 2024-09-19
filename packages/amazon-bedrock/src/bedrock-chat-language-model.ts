import {
  JSONObject,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { ParseResult } from '@ai-sdk/provider-utils';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
  ConverseStreamCommand,
  ConverseStreamOutput,
  GuardrailConfiguration,
  GuardrailStreamConfiguration,
  Tool,
  ToolConfiguration,
  ToolInputSchema,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockChatModelId,
  BedrockChatSettings,
} from './bedrock-chat-settings';
import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';
import { mapBedrockFinishReason } from './map-bedrock-finish-reason';

type BedrockChatConfig = {
  client: BedrockRuntimeClient;
  generateId: () => string;
};

export class BedrockChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'amazon-bedrock';
  readonly defaultObjectGenerationMode = 'tool';
  readonly supportsImageUrls = false;

  readonly modelId: BedrockChatModelId;
  readonly settings: BedrockChatSettings;

  private readonly config: BedrockChatConfig;

  constructor(
    modelId: BedrockChatModelId,
    settings: BedrockChatSettings,
    config: BedrockChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  private async getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    providerMetadata,
    headers,
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

    if (headers != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'headers',
      });
    }

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

    if (responseFormat != null && responseFormat.type !== 'text') {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format is not supported.',
      });
    }

    const { system, messages } = convertToBedrockChatMessages(prompt);

    const baseArgs: ConverseCommandInput = {
      modelId: this.modelId,
      system: system ? [{ text: system }] : undefined,
      additionalModelRequestFields: this.settings.additionalModelRequestFields,
      inferenceConfig: {
        maxTokens,
        temperature,
        topP,
        stopSequences,
      },
      messages,
      guardrailConfig: providerMetadata?.bedrock?.guardrailConfig as
        | GuardrailConfiguration
        | GuardrailStreamConfiguration
        | undefined,
    };

    switch (type) {
      case 'regular': {
        const toolConfig = prepareToolsAndToolChoice(mode);

        return {
          ...baseArgs,
          ...(toolConfig.tools?.length ? { toolConfig } : {}),
        } satisfies ConverseCommandInput;
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'json-mode object generation',
        });
      }

      case 'object-tool': {
        return {
          ...baseArgs,
          toolConfig: {
            tools: [
              {
                toolSpec: {
                  name: mode.tool.name,
                  description: mode.tool.description,
                  inputSchema: {
                    json: mode.tool.parameters,
                  } as ToolInputSchema,
                },
              },
            ],
            toolChoice: { tool: { name: mode.tool.name } },
          },
        } satisfies ConverseCommandInput;
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
    const args = await this.getArgs(options);

    const response = await this.config.client.send(new ConverseCommand(args));

    const { messages: rawPrompt, ...rawSettings } = args;

    const providerMetadata = response.trace
      ? { bedrock: { trace: response.trace as JSONObject } }
      : undefined;

    return {
      text:
        response.output?.message?.content
          ?.map(part => part.text ?? '')
          .join('') ?? undefined,
      toolCalls: response.output?.message?.content
        ?.filter(part => !!part.toolUse)
        ?.map(part => ({
          toolCallType: 'function',
          toolCallId: part.toolUse?.toolUseId ?? this.config.generateId(),
          toolName: part.toolUse?.name ?? `tool-${this.config.generateId()}`,
          args: JSON.stringify(part.toolUse?.input ?? ''),
        })),
      finishReason: mapBedrockFinishReason(response.stopReason),
      usage: {
        promptTokens: response.usage?.inputTokens ?? Number.NaN,
        completionTokens: response.usage?.outputTokens ?? Number.NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      warnings: [],
      providerMetadata,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const args = await this.getArgs(options);

    const response = await this.config.client.send(
      new ConverseStreamCommand({ ...args }),
    );

    const { messages: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };
    let providerMetadata: LanguageModelV1ProviderMetadata | undefined =
      undefined;

    if (!response.stream) {
      throw new Error('No stream found');
    }

    const stream = new ReadableStream<any>({
      async start(controller) {
        for await (const chunk of response.stream!) {
          controller.enqueue({ success: true, value: chunk });
        }
        controller.close();
      },
    });

    const toolCallContentBlocks: Record<
      number,
      {
        toolCallId: string;
        toolName: string;
        jsonText: string;
      }
    > = {};

    return {
      stream: stream.pipeThrough(
        new TransformStream<
          ParseResult<ConverseStreamOutput>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            function enqueueError(error: Error) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error });
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              enqueueError(chunk.error);
              return;
            }

            const value = chunk.value;

            // handle errors:
            if (value.internalServerException) {
              enqueueError(value.internalServerException);
              return;
            }
            if (value.modelStreamErrorException) {
              enqueueError(value.modelStreamErrorException);
              return;
            }
            if (value.throttlingException) {
              enqueueError(value.throttlingException);
              return;
            }
            if (value.validationException) {
              enqueueError(value.validationException);
              return;
            }

            if (value.messageStop) {
              finishReason = mapBedrockFinishReason(
                value.messageStop.stopReason,
              );
            }

            if (value.metadata) {
              usage = {
                promptTokens: value.metadata.usage?.inputTokens ?? Number.NaN,
                completionTokens:
                  value.metadata.usage?.outputTokens ?? Number.NaN,
              };

              if (value.metadata.trace) {
                providerMetadata = {
                  bedrock: {
                    trace: value.metadata.trace as JSONObject,
                  },
                };
              }
            }

            if (value.contentBlockDelta?.delta?.text) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: value.contentBlockDelta.delta.text,
              });
            }

            const contentBlockStart = value.contentBlockStart;
            if (contentBlockStart?.start?.toolUse != null) {
              const toolUse = contentBlockStart.start.toolUse;
              toolCallContentBlocks[contentBlockStart.contentBlockIndex!] = {
                toolCallId: toolUse.toolUseId!,
                toolName: toolUse.name!,
                jsonText: '',
              };
            }

            const contentBlockDelta = value.contentBlockDelta;
            if (contentBlockDelta?.delta?.toolUse) {
              const contentBlock =
                toolCallContentBlocks[contentBlockDelta.contentBlockIndex!];
              const delta = contentBlockDelta.delta.toolUse.input ?? '';

              controller.enqueue({
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: contentBlock.toolCallId,
                toolName: contentBlock.toolName,
                argsTextDelta: delta,
              });

              contentBlock.jsonText += delta;
            }

            const contentBlockStop = value.contentBlockStop;
            if (contentBlockStop != null) {
              const index = contentBlockStop.contentBlockIndex!;
              const contentBlock = toolCallContentBlocks[index];

              // when finishing a tool call block, send the full tool call:
              if (contentBlock != null) {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: contentBlock.toolCallId,
                  toolName: contentBlock.toolName,
                  args: contentBlock.jsonText,
                });

                delete toolCallContentBlocks[index];
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
              providerMetadata,
            });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      warnings: [],
    };
  }
}

function prepareToolsAndToolChoice(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
): ToolConfiguration {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined };
  }

  const mappedTools: Tool[] = tools.map(tool => ({
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        json: tool.parameters,
      } as ToolInputSchema,
    },
  }));

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return { tools: mappedTools, toolChoice: undefined };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return { tools: mappedTools, toolChoice: { auto: {} } };
    case 'required':
      return { tools: mappedTools, toolChoice: { any: {} } };
    case 'none':
      // Bedrock does not support 'none' tool choice, so we remove the tools:
      return { tools: undefined, toolChoice: undefined };
    case 'tool':
      return {
        tools: mappedTools,
        toolChoice: { tool: { name: toolChoice.toolName } },
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}
