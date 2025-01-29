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
  lastMessage,
}: {
  stream: ReadableStream<Uint8Array>;
  update: (options: {
    message: Message;
    data: JSONValue[] | undefined;
    replaceLastMessage: boolean;
  }) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    message: Message | undefined;
    finishReason: LanguageModelV1FinishReason;
    usage: LanguageModelUsage;
  }) => void;
  generateId?: () => string;
  getCurrentDate?: () => Date;
  lastMessage: Message | undefined;
}) {
  const replaceLastMessage = lastMessage?.role === 'assistant';
  let step = replaceLastMessage
    ? 1 +
      // find max step in existing tool invocations:
      (lastMessage.toolInvocations?.reduce((max, toolInvocation) => {
        return Math.max(max, toolInvocation.step ?? 0);
      }, 0) ?? 0)
    : 0;

  const message: Message = replaceLastMessage
    ? structuredClone(lastMessage)
    : {
        id: generateId(),
        createdAt: getCurrentDate(),
        role: 'assistant',
        content: '',
      };

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

    // keeps the currentMessage up to date with the latest annotations,
    // even if annotations preceded the message creation
    if (messageAnnotations?.length) {
      message.annotations = messageAnnotations;
    }

    const copiedMessage = {
      // deep copy the message to ensure that deep changes (msg attachments) are updated
      // with SolidJS. SolidJS uses referential integration of sub-objects to detect changes.
      ...structuredClone(message),
      // add a revision id to ensure that the message is updated with SWR. SWR uses a
      // hashing approach by default to detect changes, but it only works for shallow
      // changes. This is why we need to add a revision id to ensure that the message
      // is updated with SWR (without it, the changes get stuck in SWR and are not
      // forwarded to rendering):
      revisionId: generateId(),
    } as Message;

    update({
      message: copiedMessage,
      data: copiedData,
      replaceLastMessage,
    });
  }

  await processDataStream({
    stream,
    onTextPart(value) {
      message.content += value;
      execUpdate();
    },
    onReasoningPart(value) {
      message.reasoning = (message.reasoning ?? '') + value;
      execUpdate();
    },
    onToolCallStreamingStartPart(value) {
      if (message.toolInvocations == null) {
        message.toolInvocations = [];
      }

      // add the partial tool call to the map
      partialToolCalls[value.toolCallId] = {
        text: '',
        toolName: value.toolName,
        index: message.toolInvocations.length,
      };

      message.toolInvocations.push({
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        args: undefined,
      });

      execUpdate();
    },
    onToolCallDeltaPart(value) {
      const partialToolCall = partialToolCalls[value.toolCallId];

      partialToolCall.text += value.argsTextDelta;

      const { value: partialArgs } = parsePartialJson(partialToolCall.text);

      message.toolInvocations![partialToolCall.index] = {
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: partialToolCall.toolName,
        args: partialArgs,
      };

      execUpdate();
    },
    async onToolCallPart(value) {
      if (partialToolCalls[value.toolCallId] != null) {
        // change the partial tool call to a full tool call
        message.toolInvocations![partialToolCalls[value.toolCallId].index] = {
          state: 'call',
          step,
          ...value,
        };
      } else {
        if (message.toolInvocations == null) {
          message.toolInvocations = [];
        }

        message.toolInvocations.push({
          state: 'call',
          step,
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
          message.toolInvocations![message.toolInvocations!.length - 1] = {
            state: 'result',
            step,
            ...value,
            result,
          };
        }
      }

      execUpdate();
    },
    onToolResultPart(value) {
      const toolInvocations = message.toolInvocations;

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
      step += 1;
    },
    onStartStepPart(value) {
      // keep message id stable when we are updating an existing message:
      if (!replaceLastMessage) {
        message.id = value.messageId;
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

  onFinish?.({ message, finishReason, usage });
}
