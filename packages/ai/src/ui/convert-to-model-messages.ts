import {
  AssistantContent,
  ModelMessage,
  ToolResultPart,
} from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text/tool-set';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
import { MessageConversionError } from '../prompt/message-conversion-error';
import {
  DynamicToolUIPart,
  FileUIPart,
  getToolName,
  isToolUIPart,
  ReasoningUIPart,
  TextUIPart,
  ToolUIPart,
  UIMessage,
  UITools,
} from './ui-messages';

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).

@param messages - The messages to convert.
@param options.tools - The tools to use.
@param options.ignoreIncompleteToolCalls - Whether to ignore incomplete tool calls. Default is `false`.
 */
export function convertToModelMessages(
  messages: Array<Omit<UIMessage, 'id'>>,
  options?: {
    tools?: ToolSet;
    ignoreIncompleteToolCalls?: boolean;
  },
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  if (options?.ignoreIncompleteToolCalls) {
    messages = messages.map(message => ({
      ...message,
      parts: message.parts.filter(
        part =>
          !isToolUIPart(part) ||
          (part.state !== 'input-streaming' &&
            part.state !== 'input-available'),
      ),
    }));
  }

  for (const message of messages) {
    switch (message.role) {
      case 'system': {
        const textParts = message.parts.filter(part => part.type === 'text');

        const providerMetadata = textParts.reduce((acc, part) => {
          if (part.providerMetadata != null) {
            return { ...acc, ...part.providerMetadata };
          }
          return acc;
        }, {});

        modelMessages.push({
          role: 'system',
          content: textParts.map(part => part.text).join(''),
          ...(Object.keys(providerMetadata).length > 0
            ? { providerOptions: providerMetadata }
            : {}),
        });
        break;
      }

      case 'user': {
        modelMessages.push({
          role: 'user',
          content: message.parts
            .filter(
              (part): part is TextUIPart | FileUIPart =>
                part.type === 'text' || part.type === 'file',
            )
            .map(part => {
              switch (part.type) {
                case 'text':
                  return {
                    type: 'text' as const,
                    text: part.text,
                    ...(part.providerMetadata != null
                      ? { providerOptions: part.providerMetadata }
                      : {}),
                  };
                case 'file':
                  return {
                    type: 'file' as const,
                    mediaType: part.mediaType,
                    filename: part.filename,
                    data: part.url,
                    ...(part.providerMetadata != null
                      ? { providerOptions: part.providerMetadata }
                      : {}),
                  };
                default:
                  return part;
              }
            }),
        });

        break;
      }

      case 'assistant': {
        if (message.parts != null) {
          let block: Array<
            | TextUIPart
            | ToolUIPart<UITools>
            | ReasoningUIPart
            | FileUIPart
            | DynamicToolUIPart
          > = [];

          function processBlock() {
            if (block.length === 0) {
              return;
            }

            const content: AssistantContent = [];

            for (const part of block) {
              if (part.type === 'text') {
                content.push({
                  type: 'text' as const,
                  text: part.text,
                  ...(part.providerMetadata != null
                    ? { providerOptions: part.providerMetadata }
                    : {}),
                });
              } else if (part.type === 'file') {
                content.push({
                  type: 'file' as const,
                  mediaType: part.mediaType,
                  filename: part.filename,
                  data: part.url,
                });
              } else if (part.type === 'reasoning') {
                content.push({
                  type: 'reasoning' as const,
                  text: part.text,
                  providerOptions: part.providerMetadata,
                });
              } else if (part.type === 'dynamic-tool') {
                const toolName = part.toolName;

                if (part.state === 'input-streaming') {
                  throw new MessageConversionError({
                    originalMessage: message,
                    message: `incomplete tool input is not supported: ${part.toolCallId}`,
                  });
                } else {
                  content.push({
                    type: 'tool-call' as const,
                    toolCallId: part.toolCallId,
                    toolName,
                    input: part.input,
                    ...(part.callProviderMetadata != null
                      ? { providerOptions: part.callProviderMetadata }
                      : {}),
                  });
                }
              } else if (isToolUIPart(part)) {
                const toolName = getToolName(part);

                if (part.state === 'input-streaming') {
                  throw new MessageConversionError({
                    originalMessage: message,
                    message: `incomplete tool input is not supported: ${part.toolCallId}`,
                  });
                } else {
                  content.push({
                    type: 'tool-call' as const,
                    toolCallId: part.toolCallId,
                    toolName,
                    input:
                      part.state === 'output-error'
                        ? (part.input ?? part.rawInput)
                        : part.input,
                    providerExecuted: part.providerExecuted,
                    ...(part.callProviderMetadata != null
                      ? { providerOptions: part.callProviderMetadata }
                      : {}),
                  });

                  if (
                    part.providerExecuted === true &&
                    (part.state === 'output-available' ||
                      part.state === 'output-error')
                  ) {
                    content.push({
                      type: 'tool-result',
                      toolCallId: part.toolCallId,
                      toolName,
                      output: createToolModelOutput({
                        output:
                          part.state === 'output-error'
                            ? part.errorText
                            : part.output,
                        tool: options?.tools?.[toolName],
                        errorMode:
                          part.state === 'output-error' ? 'json' : 'none',
                      }),
                    });
                  }
                }
              } else {
                const _exhaustiveCheck: never = part;
                throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
              }
            }

            modelMessages.push({
              role: 'assistant',
              content,
            });

            // check if there are tool invocations with results in the block
            const toolParts = block.filter(
              part =>
                (isToolUIPart(part) && part.providerExecuted !== true) ||
                part.type === 'dynamic-tool',
            ) as (ToolUIPart<UITools> | DynamicToolUIPart)[];

            // tool message with tool results
            if (toolParts.length > 0) {
              modelMessages.push({
                role: 'tool',
                content: toolParts.map((toolPart): ToolResultPart => {
                  switch (toolPart.state) {
                    case 'output-error':
                    case 'output-available': {
                      const toolName =
                        toolPart.type === 'dynamic-tool'
                          ? toolPart.toolName
                          : getToolName(toolPart);

                      return {
                        type: 'tool-result',
                        toolCallId: toolPart.toolCallId,
                        toolName,
                        output: createToolModelOutput({
                          output:
                            toolPart.state === 'output-error'
                              ? toolPart.errorText
                              : toolPart.output,
                          tool: options?.tools?.[toolName],
                          errorMode:
                            toolPart.state === 'output-error' ? 'text' : 'none',
                        }),
                      };
                    }

                    default: {
                      throw new MessageConversionError({
                        originalMessage: message,
                        message: `Unsupported tool part state: ${toolPart.state}`,
                      });
                    }
                  }
                }),
              });
            }

            // updates for next block
            block = [];
          }

          for (const part of message.parts) {
            if (
              part.type === 'text' ||
              part.type === 'reasoning' ||
              part.type === 'file' ||
              part.type === 'dynamic-tool' ||
              isToolUIPart(part)
            ) {
              block.push(part);
            } else if (part.type === 'step-start') {
              processBlock();
            }
          }

          processBlock();

          break;
        }

        break;
      }

      default: {
        const _exhaustiveCheck: never = message.role;
        throw new MessageConversionError({
          originalMessage: message,
          message: `Unsupported role: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  return modelMessages;
}

/**
@deprecated Use `convertToModelMessages` instead.
 */
// TODO remove in AI SDK 6
export const convertToCoreMessages = convertToModelMessages;
