import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { parsePartialJson } from './parse-partial-json';
import { processDataStream } from './process-data-stream';
import type { JSONValue, Message, UseChatOptions } from './types';
import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import { LanguageModelUsage } from './duplicated/usage';

type MessageContainer = {
  message?: Message;
};

function assignAnnotationsToMessage<T extends Message | null | undefined>(
  message: T,
  annotations: JSONValue[] | undefined,
): T {
  if (!message || !annotations || !annotations.length) return message;
  return { ...message, annotations: [...annotations] } as T;
}

export async function processChatResponse({
  stream,
  update,
  onToolCall,
  onFinish,
  generateId = generateIdFunction,
  getCurrentDate = () => new Date(),
}: {
  stream: ReadableStream<Uint8Array>;
  update: (newMessages: Message[], data: JSONValue[] | undefined) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    message: Message | undefined;
    finishReason: LanguageModelV1FinishReason;
    usage: LanguageModelUsage;
  }) => void;
  generateId?: () => string;
  getCurrentDate?: () => Date;
}) {
  const createdAt = getCurrentDate();

  let currentMessage: MessageContainer = {};
  let nextMessage: MessageContainer | undefined = undefined;
  const previousMessages: Message[] = [];

  const data: JSONValue[] = [];

  // keep list of current message annotations for message
  let messageAnnotations: JSONValue[] | undefined = undefined;

  // keep track of partial tool calls
  const partialToolCalls: Record<
    string,
    { text: string; prefixMapIndex: number; toolName: string }
  > = {};

  let usage: LanguageModelUsage = {
    completionTokens: NaN,
    promptTokens: NaN,
    totalTokens: NaN,
  };
  let finishReason: LanguageModelV1FinishReason = 'unknown';

  function execUpdate() {
    // keeps the currentMessage up to date with the latest annotations, even if annotations preceded the message
    if (messageAnnotations?.length && currentMessage.message) {
      currentMessage.message.annotations = [...messageAnnotations!];
    }

    // We add response messages to the messages[], but data is its own thing
    const merged = [currentMessage.message].filter(Boolean).map(message => ({
      ...assignAnnotationsToMessage(message, messageAnnotations),
    })) as Message[];

    update([...previousMessages, ...merged], [...data]); // make a copy of the data array
  }

  // switch to the next prefix map once we start receiving
  // content of the next message. Stream data annotations
  // are associated with the previous message until then to
  // support sending them in onFinish and onStepFinish:
  function switchMessage() {
    if (nextMessage != null) {
      if (currentMessage.message) {
        previousMessages.push(currentMessage.message);
      }

      currentMessage = nextMessage;
      nextMessage = undefined;
    }
  }

  // we create a map of each prefix, and for each prefixed message we push to the map
  await processDataStream({
    stream,
    onStreamPart: async ({ type, value }) => {
      if (type === 'error') {
        throw new Error(value);
      } else if (type === 'finish_step') {
        if (!value.isContinued) {
          nextMessage = {};
        }
        return;
      } else if (type === 'finish_message') {
        finishReason = value.finishReason;

        if (value.usage != null) {
          const { completionTokens, promptTokens } = value.usage;

          usage = {
            completionTokens,
            promptTokens,
            totalTokens: completionTokens + promptTokens,
          };
        }

        return;
      } else if (type === 'text') {
        switchMessage();
        if (currentMessage['message']) {
          currentMessage['message'] = {
            ...currentMessage['message'],
            content: (currentMessage['message'].content || '') + value,
          };
        } else {
          currentMessage['message'] = {
            id: generateId(),
            role: 'assistant',
            content: value,
            createdAt,
          };
        }
        execUpdate();
      } else if (type === 'tool_call_streaming_start') {
        switchMessage();
        // create message if it doesn't exist
        if (currentMessage.message == null) {
          currentMessage.message = {
            id: generateId(),
            role: 'assistant',
            content: '',
            createdAt,
          };
        }

        if (currentMessage.message.toolInvocations == null) {
          currentMessage.message.toolInvocations = [];
        }

        // add the partial tool call to the map
        partialToolCalls[value.toolCallId] = {
          text: '',
          toolName: value.toolName,
          prefixMapIndex: currentMessage.message.toolInvocations.length,
        };

        currentMessage.message.toolInvocations.push({
          state: 'partial-call',
          toolCallId: value.toolCallId,
          toolName: value.toolName,
          args: undefined,
        });
        execUpdate();
      } else if (type === 'tool_call_delta') {
        switchMessage();
        const partialToolCall = partialToolCalls[value.toolCallId];

        partialToolCall.text += value.argsTextDelta;

        const { value: partialArgs } = parsePartialJson(partialToolCall.text);

        currentMessage.message!.toolInvocations![
          partialToolCall.prefixMapIndex
        ] = {
          state: 'partial-call',
          toolCallId: value.toolCallId,
          toolName: partialToolCall.toolName,
          args: partialArgs,
        };

        // trigger update for streaming by copying adding a update id that changes
        // (without it, the changes get stuck in SWR and are not forwarded to rendering):
        (currentMessage.message! as any).internalUpdateId = generateId();
        execUpdate();
      } else if (type === 'tool_call') {
        switchMessage();
        if (partialToolCalls[value.toolCallId] != null) {
          // change the partial tool call to a full tool call
          currentMessage.message!.toolInvocations![
            partialToolCalls[value.toolCallId].prefixMapIndex
          ] = { state: 'call', ...value };
        } else {
          // create message if it doesn't exist
          if (currentMessage.message == null) {
            currentMessage.message = {
              id: generateId(),
              role: 'assistant',
              content: '',
              createdAt,
            };
          }

          if (currentMessage.message.toolInvocations == null) {
            currentMessage.message.toolInvocations = [];
          }

          currentMessage.message.toolInvocations.push({
            state: 'call',
            ...value,
          });
        }

        // trigger update for streaming by copying adding a update id that changes
        // (without it, the changes get stuck in SWR and are not forwarded to rendering):
        (currentMessage.message! as any).internalUpdateId = generateId();

        // invoke the onToolCall callback if it exists. This is blocking.
        // In the future we should make this non-blocking, which
        // requires additional state management for error handling etc.
        if (onToolCall) {
          const result = await onToolCall({ toolCall: value });
          if (result != null) {
            // store the result in the tool invocation
            currentMessage.message!.toolInvocations![
              currentMessage.message!.toolInvocations!.length - 1
            ] = { state: 'result', ...value, result };
          }
        }
        execUpdate();
      } else if (type === 'tool_result') {
        switchMessage();
        const toolInvocations = currentMessage.message?.toolInvocations;

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

        toolInvocations[toolInvocationIndex] = {
          ...toolInvocations[toolInvocationIndex],
          state: 'result' as const,
          ...value,
        };
        execUpdate();
      } else if (type === 'data') {
        data.push(...value);
        execUpdate();
      } else if (type === 'message_annotations') {
        if (!messageAnnotations) {
          messageAnnotations = [...value];
        } else {
          messageAnnotations.push(...value);
        }

        // Update any existing message with the latest annotations
        currentMessage.message = assignAnnotationsToMessage(
          currentMessage.message,
          messageAnnotations,
        );

        // trigger update for streaming by copying adding a update id that changes
        // (without it, the changes get stuck in SWR and are not forwarded to rendering):
        if (currentMessage.message != null) {
          (currentMessage.message! as any).internalUpdateId = generateId();
        }

        execUpdate();
      }
    },
  });

  onFinish?.({ message: currentMessage.message, finishReason, usage });

  return {
    messages: [currentMessage.message].filter(Boolean) as Message[],
    data,
  };
}
