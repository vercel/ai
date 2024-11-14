import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { parsePartialJson } from './parse-partial-json';
import { processDataStream } from './process-data-stream';
import type { JSONValue, Message, UseChatOptions } from './types';
import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import {
  calculateLanguageModelUsage,
  LanguageModelUsage,
} from './duplicated/usage';

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

  let currentMessage: Message | undefined = undefined;
  let createNewMessage: boolean = true;
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
    if (messageAnnotations?.length && currentMessage) {
      currentMessage.annotations = [...messageAnnotations!];
    }

    // We add response messages to the messages[], but data is its own thing
    const merged = [currentMessage].filter(Boolean).map(message => ({
      ...assignAnnotationsToMessage(message, messageAnnotations),
    })) as Message[];

    update([...previousMessages, ...merged], [...data]); // make a copy of the data array
  }

  // switch to the next prefix map once we start receiving
  // content of the next message. Stream data annotations
  // are associated with the previous message until then to
  // support sending them in onFinish and onStepFinish:
  function switchMessage(): Message {
    if (createNewMessage || currentMessage == null) {
      if (currentMessage != null) {
        previousMessages.push(currentMessage);
      }

      createNewMessage = false;

      currentMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        createdAt,
      };
    }

    return currentMessage;
  }

  await processDataStream({
    stream,
    onTextPart(value) {
      const activeMessage = switchMessage();
      currentMessage = {
        ...activeMessage,
        content: activeMessage.content + value,
      };
      execUpdate();
    },
    onToolCallStreamingStartPart(value) {
      const activeMessage = switchMessage();

      if (activeMessage.toolInvocations == null) {
        activeMessage.toolInvocations = [];
      }

      // add the partial tool call to the map
      partialToolCalls[value.toolCallId] = {
        text: '',
        toolName: value.toolName,
        prefixMapIndex: activeMessage.toolInvocations.length,
      };

      activeMessage.toolInvocations.push({
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        args: undefined,
      });
      execUpdate();
    },
    onToolCallDeltaPart(value) {
      switchMessage();
      const partialToolCall = partialToolCalls[value.toolCallId];

      partialToolCall.text += value.argsTextDelta;

      const { value: partialArgs } = parsePartialJson(partialToolCall.text);

      currentMessage!.toolInvocations![partialToolCall.prefixMapIndex] = {
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: partialToolCall.toolName,
        args: partialArgs,
      };

      // trigger update for streaming by copying adding a update id that changes
      // (without it, the changes get stuck in SWR and are not forwarded to rendering):
      (currentMessage! as any).internalUpdateId = generateId();
      execUpdate();
    },
    async onToolCallPart(value) {
      switchMessage();
      if (partialToolCalls[value.toolCallId] != null) {
        // change the partial tool call to a full tool call
        currentMessage!.toolInvocations![
          partialToolCalls[value.toolCallId].prefixMapIndex
        ] = { state: 'call', ...value };
      } else {
        // create message if it doesn't exist
        if (currentMessage == null) {
          currentMessage = {
            id: generateId(),
            role: 'assistant',
            content: '',
            createdAt,
          };
        }

        if (currentMessage.toolInvocations == null) {
          currentMessage.toolInvocations = [];
        }

        currentMessage.toolInvocations.push({
          state: 'call',
          ...value,
        });
      }

      // trigger update for streaming by copying adding a update id that changes
      // (without it, the changes get stuck in SWR and are not forwarded to rendering):
      (currentMessage! as any).internalUpdateId = generateId();

      // invoke the onToolCall callback if it exists. This is blocking.
      // In the future we should make this non-blocking, which
      // requires additional state management for error handling etc.
      if (onToolCall) {
        const result = await onToolCall({ toolCall: value });
        if (result != null) {
          // store the result in the tool invocation
          currentMessage!.toolInvocations![
            currentMessage!.toolInvocations!.length - 1
          ] = { state: 'result', ...value, result };
        }
      }
      execUpdate();
    },
    onToolResultPart(value) {
      switchMessage();
      const toolInvocations = currentMessage?.toolInvocations;

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
    },
    onDataPart(value) {
      data.push(...value);
      execUpdate();
    },
    onMessageAnnotationsPart(value) {
      if (!messageAnnotations) {
        messageAnnotations = [...value];
      } else {
        messageAnnotations.push(...value);
      }

      // Update any existing message with the latest annotations
      currentMessage = assignAnnotationsToMessage(
        currentMessage,
        messageAnnotations,
      );

      // trigger update for streaming by copying adding a update id that changes
      // (without it, the changes get stuck in SWR and are not forwarded to rendering):
      if (currentMessage != null) {
        (currentMessage! as any).internalUpdateId = generateId();
      }

      execUpdate();
    },
    onFinishStepPart(value) {
      if (!value.isContinued) {
        createNewMessage = true;
      }
    },
    onFinishMessagePart(value) {
      finishReason = value.finishReason;
      if (value.usage != null) {
        usage = calculateLanguageModelUsage(value.usage);
      }
    },
    onErrorPart(error) {
      throw new Error(error);
    },
  });

  onFinish?.({ message: currentMessage, finishReason, usage });
}
