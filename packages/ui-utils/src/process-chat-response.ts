import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { parsePartialJson } from './parse-partial-json';
import { processDataStream } from './process-data-stream';
import type { JSONValue, Message, UseChatOptions } from './types';
import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import {
  calculateLanguageModelUsage,
  LanguageModelUsage,
} from './duplicated/usage';

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
    { text: string; index: number; toolName: string }
  > = {};

  let usage: LanguageModelUsage = {
    completionTokens: NaN,
    promptTokens: NaN,
    totalTokens: NaN,
  };
  let finishReason: LanguageModelV1FinishReason = 'unknown';

  function execUpdate() {
    // make a copy of the data array to ensure UI is updated (SWR)
    const copiedData = [...data];

    // if there is not current message, update still (data might have changed)
    if (currentMessage == null) {
      update(previousMessages, copiedData);
      return;
    }

    // keeps the currentMessage up to date with the latest annotations,
    // even if annotations preceded the message creation
    if (messageAnnotations?.length) {
      currentMessage.annotations = messageAnnotations;
    }

    const copiedMessage = {
      // deep copy the message to ensure that deep changes (msg attachments) are updated
      // with SolidJS. SolidJS uses referential integration of sub-objects to detect changes.
      ...JSON.parse(JSON.stringify(currentMessage)),
      // add a revision id to ensure that the message is updated with SWR. SWR uses a
      // hashing approach by default to detect changes, but it only works for shallow
      // changes. This is why we need to add a revision id to ensure that the message
      // is updated with SWR (without it, the changes get stuck in SWR and are not
      // forwarded to rendering):
      revisionId: generateId(),
      // Fill in createdAt to retain Date object (lost in JSON.parse):
      createdAt: currentMessage.createdAt,
    } as Message;

    update([...previousMessages, copiedMessage], copiedData);
  }

  // switch to the next prefix map once we start receiving
  // content of the next message. Stream data annotations
  // are associated with the previous message until then to
  // support sending them in onFinish and onStepFinish:
  function getMessage(): Message {
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
      const activeMessage = getMessage();
      currentMessage = {
        ...activeMessage,
        content: activeMessage.content + value,
      };
      execUpdate();
    },
    onToolCallStreamingStartPart(value) {
      const activeMessage = getMessage();

      if (activeMessage.toolInvocations == null) {
        activeMessage.toolInvocations = [];
      }

      // add the partial tool call to the map
      partialToolCalls[value.toolCallId] = {
        text: '',
        toolName: value.toolName,
        index: activeMessage.toolInvocations.length,
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
      const activeMessage = getMessage();
      const partialToolCall = partialToolCalls[value.toolCallId];

      partialToolCall.text += value.argsTextDelta;

      const { value: partialArgs } = parsePartialJson(partialToolCall.text);

      activeMessage.toolInvocations![partialToolCall.index] = {
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: partialToolCall.toolName,
        args: partialArgs,
      };

      execUpdate();
    },
    async onToolCallPart(value) {
      const activeMessage = getMessage();

      if (partialToolCalls[value.toolCallId] != null) {
        // change the partial tool call to a full tool call
        activeMessage.toolInvocations![
          partialToolCalls[value.toolCallId].index
        ] = { state: 'call', ...value };
      } else {
        if (activeMessage.toolInvocations == null) {
          activeMessage.toolInvocations = [];
        }

        activeMessage.toolInvocations.push({
          state: 'call',
          ...value,
        });
      }

      // invoke the onToolCall callback if it exists. This is blocking.
      // In the future we should make this non-blocking, which
      // requires additional state management for error handling etc.
      if (onToolCall) {
        const result = await onToolCall({ toolCall: value });
        if (result != null) {
          // store the result in the tool invocation
          activeMessage.toolInvocations![
            activeMessage.toolInvocations!.length - 1
          ] = { state: 'result', ...value, result };
        }
      }

      execUpdate();
    },
    onToolResultPart(value) {
      const activeMessage = getMessage();
      const toolInvocations = activeMessage.toolInvocations;

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
      if (messageAnnotations == null) {
        messageAnnotations = [...value];
      } else {
        messageAnnotations.push(...value);
      }

      execUpdate();
    },
    onFinishStepPart(value) {
      createNewMessage = !value.isContinued;
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
