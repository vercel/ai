import { Schema, validateTypes } from '@ai-sdk/provider-utils';
import { DataStreamPart } from '../data-stream/data-stream-parts';
import { mergeObjects } from '../util/merge-objects';
import { parsePartialJson } from '../util/parse-partial-json';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from './ui-messages';
import { UseChatOptions } from './use-chat';

export function processChatResponse<MESSAGE_METADATA = unknown>({
  stream,
  onUpdate,
  onToolCall,
  onFinish,
  lastMessage,
  newMessageId,
  messageMetadataSchema,
}: {
  stream: ReadableStream<DataStreamPart>;
  lastMessage: UIMessage<MESSAGE_METADATA> | undefined;
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
  newMessageId: string;
  onToolCall?: UseChatOptions['onToolCall'];
  onUpdate?: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  onFinish?: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
}): ReadableStream<DataStreamPart> {
  const isContinuation = lastMessage?.role === 'assistant';

  let step = isContinuation
    ? 1 + (extractMaxToolInvocationStep(getToolInvocations(lastMessage)) ?? 0)
    : 0;

  const message: UIMessage<MESSAGE_METADATA> = isContinuation
    ? structuredClone(lastMessage)
    : {
        id: newMessageId,
        metadata: {} as MESSAGE_METADATA,
        role: 'assistant',
        parts: [],
      };

  let currentTextPart: TextUIPart | undefined = undefined;
  let currentReasoningPart: ReasoningUIPart | undefined = undefined;

  function updateToolInvocationPart(
    toolCallId: string,
    invocation: ToolInvocation,
  ) {
    const part = message.parts.find(
      part =>
        part.type === 'tool-invocation' &&
        part.toolInvocation.toolCallId === toolCallId,
    ) as ToolInvocationUIPart | undefined;

    if (part != null) {
      part.toolInvocation = invocation;
    } else {
      message.parts.push({
        type: 'tool-invocation',
        toolInvocation: invocation,
      });
    }
  }

  // keep track of partial tool calls
  const partialToolCalls: Record<
    string,
    { text: string; step: number; index: number; toolName: string }
  > = {};

  async function updateMessageMetadata(metadata: unknown) {
    if (metadata != null) {
      const mergedMetadata =
        message.metadata != null
          ? mergeObjects(message.metadata, metadata)
          : metadata;

      if (messageMetadataSchema != null) {
        await validateTypes({
          value: mergedMetadata,
          schema: messageMetadataSchema,
        });
      }

      message.metadata = mergedMetadata as MESSAGE_METADATA;
    }
  }

  return stream.pipeThrough(
    new TransformStream<DataStreamPart, DataStreamPart>({
      async transform(chunk, controller) {
        const { type, value } = chunk;

        switch (type) {
          case 'text': {
            if (currentTextPart == null) {
              currentTextPart = {
                type: 'text',
                text: value,
              };
              message.parts.push(currentTextPart);
            } else {
              currentTextPart.text += value;
            }

            onUpdate?.({ message });
            break;
          }

          case 'reasoning': {
            if (currentReasoningPart == null) {
              currentReasoningPart = {
                type: 'reasoning',
                text: value.text,
                providerMetadata: value.providerMetadata,
              };
              message.parts.push(currentReasoningPart);
            } else {
              currentReasoningPart.text += value.text;
              currentReasoningPart.providerMetadata = value.providerMetadata;
            }

            onUpdate?.({ message });
            break;
          }

          case 'reasoning-part-finish': {
            if (currentReasoningPart != null) {
              currentReasoningPart = undefined;
            }
            break;
          }

          case 'file': {
            message.parts.push({
              type: 'file',
              mediaType: value.mediaType,
              url: value.url,
            });

            onUpdate?.({ message });
            break;
          }

          case 'source': {
            message.parts.push({
              type: 'source',
              source: value,
            });

            onUpdate?.({ message });
            break;
          }

          case 'tool-call-streaming-start': {
            const toolInvocations = getToolInvocations(message);

            // add the partial tool call to the map
            partialToolCalls[value.toolCallId] = {
              text: '',
              step,
              toolName: value.toolName,
              index: toolInvocations.length,
            };

            updateToolInvocationPart(value.toolCallId, {
              state: 'partial-call',
              step,
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              args: undefined,
            } as const);

            onUpdate?.({ message });
            break;
          }

          case 'tool-call-delta': {
            const partialToolCall = partialToolCalls[value.toolCallId];

            partialToolCall.text += value.argsTextDelta;

            const { value: partialArgs } = await parsePartialJson(
              partialToolCall.text,
            );

            updateToolInvocationPart(value.toolCallId, {
              state: 'partial-call',
              step: partialToolCall.step,
              toolCallId: value.toolCallId,
              toolName: partialToolCall.toolName,
              args: partialArgs,
            } as const);

            onUpdate?.({ message });
            break;
          }

          case 'tool-call': {
            // workaround for Zod issue where unknown includes undefined
            const call = { args: value.args!, ...value };

            updateToolInvocationPart(value.toolCallId, {
              state: 'call',
              step,
              ...call,
            } as const);

            onUpdate?.({ message });

            // invoke the onToolCall callback if it exists. This is blocking.
            // In the future we should make this non-blocking, which
            // requires additional state management for error handling etc.
            if (onToolCall) {
              const result = await onToolCall({
                toolCall: call,
              });
              if (result != null) {
                updateToolInvocationPart(value.toolCallId, {
                  state: 'result',
                  step,
                  ...call,
                  result,
                } as const);

                onUpdate?.({ message });
              }
            }
            break;
          }

          case 'tool-result': {
            const toolInvocations = getToolInvocations(message);

            if (toolInvocations == null) {
              throw new Error('tool_result must be preceded by a tool_call');
            }

            // find if there is any tool invocation with the same toolCallId
            // and replace it with the result
            const toolInvocationIndex = toolInvocations.findIndex(
              invocation => invocation.toolCallId === value.toolCallId,
            );

            if (toolInvocationIndex === -1) {
              throw new Error(
                'tool_result must be preceded by a tool_call with the same toolCallId',
              );
            }

            // workaround for Zod issue where unknown includes undefined
            const result = { result: value.result!, ...value };

            updateToolInvocationPart(value.toolCallId, {
              ...toolInvocations[toolInvocationIndex],
              state: 'result' as const,
              ...result,
            } as const);

            onUpdate?.({ message });
            break;
          }

          case 'start-step': {
            // add a step boundary part to the message
            message.parts.push({ type: 'step-start' });

            await updateMessageMetadata(value.metadata);
            onUpdate?.({ message });
            break;
          }

          case 'finish-step': {
            step += 1;

            // reset the current text and reasoning parts
            currentTextPart = undefined;
            currentReasoningPart = undefined;

            await updateMessageMetadata(value.metadata);
            if (value.metadata != null) {
              onUpdate?.({ message });
            }
            break;
          }

          case 'start': {
            if (value.messageId != null) {
              message.id = value.messageId;
            }

            await updateMessageMetadata(value.metadata);

            if (value.messageId != null || value.metadata != null) {
              onUpdate?.({ message });
            }
            break;
          }

          case 'finish': {
            await updateMessageMetadata(value.metadata);
            if (value.metadata != null) {
              onUpdate?.({ message });
            }
            break;
          }

          case 'metadata': {
            await updateMessageMetadata(value.metadata);
            if (value.metadata != null) {
              onUpdate?.({ message });
            }
            break;
          }

          case 'error': {
            throw new Error(value);
          }

          default: {
            const _exhaustiveCheck: never = type;
            throw new Error(`Unhandled stream part: ${_exhaustiveCheck}`);
          }
        }

        controller.enqueue(chunk);
      },

      flush() {
        onFinish?.({ message });
      },
    }),
  );
}
