import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import {
  calculateLanguageModelUsage,
  LanguageModelUsage,
} from './duplicated/usage';
import { parsePartialJson } from './parse-partial-json';
import { processDataStream } from './process-data-stream';
import type {
  JSONValue,
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
  UseChatOptions,
} from './types';

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
    message: UIMessage;
    data: JSONValue[] | undefined;
    replaceLastMessage: boolean;
  }) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    message: UIMessage | undefined;
    finishReason: LanguageModelV1FinishReason;
    usage: LanguageModelUsage;
  }) => void;
  generateId?: () => string;
  getCurrentDate?: () => Date;
  lastMessage: UIMessage | undefined;
}) {
  const replaceLastMessage = lastMessage?.role === 'assistant';
  let step = replaceLastMessage
    ? 1 +
      // find max step in existing tool invocations:
      (lastMessage.toolInvocations?.reduce((max, toolInvocation) => {
        return Math.max(max, toolInvocation.step ?? 0);
      }, 0) ?? 0)
    : 0;

  const message: UIMessage = replaceLastMessage
    ? structuredClone(lastMessage)
    : {
        id: generateId(),
        createdAt: getCurrentDate(),
        role: 'assistant',
        content: '',
        parts: [],
      };

  let currentTextPart: TextUIPart | undefined = undefined;
  let currentReasoningPart: ReasoningUIPart | undefined = undefined;
  let currentReasoningTextDetail:
    | { type: 'text'; text: string; signature?: string }
    | undefined = undefined;

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

  const data: JSONValue[] = [];

  // keep list of current message annotations for message
  let messageAnnotations: JSONValue[] | undefined = replaceLastMessage
    ? lastMessage?.annotations
    : undefined;

  // keep track of partial tool calls
  const partialToolCalls: Record<
    string,
    { text: string; step: number; index: number; toolName: string }
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
    } as UIMessage;

    update({
      message: copiedMessage,
      data: copiedData,
      replaceLastMessage,
    });
  }

  await processDataStream({
    stream,
    onTextPart(value) {
      if (currentTextPart == null) {
        currentTextPart = {
          type: 'text',
          text: value,
        };
        message.parts.push(currentTextPart);
      } else {
        currentTextPart.text += value;
      }

      message.content += value;
      execUpdate();
    },
    onReasoningPart(value) {
      if (currentReasoningTextDetail == null) {
        currentReasoningTextDetail = { type: 'text', text: value };
        if (currentReasoningPart != null) {
          currentReasoningPart.details.push(currentReasoningTextDetail);
        }
      } else {
        currentReasoningTextDetail.text += value;
      }

      if (currentReasoningPart == null) {
        currentReasoningPart = {
          type: 'reasoning',
          reasoning: value,
          details: [currentReasoningTextDetail],
        };
        message.parts.push(currentReasoningPart);
      } else {
        currentReasoningPart.reasoning += value;
      }

      message.reasoning = (message.reasoning ?? '') + value;

      execUpdate();
    },
    onReasoningSignaturePart(value) {
      if (currentReasoningTextDetail != null) {
        currentReasoningTextDetail.signature = value.signature;
      }
    },
    onRedactedReasoningPart(value) {
      if (currentReasoningPart == null) {
        currentReasoningPart = {
          type: 'reasoning',
          reasoning: '',
          details: [],
        };
        message.parts.push(currentReasoningPart);
      }

      currentReasoningPart.details.push({
        type: 'redacted',
        data: value.data,
      });

      currentReasoningTextDetail = undefined;

      execUpdate();
    },
    onFilePart(value) {
      message.parts.push({
        type: 'file',
        mimeType: value.mimeType,
        data: value.data,
      });

      execUpdate();
    },
    onSourcePart(value) {
      message.parts.push({
        type: 'source',
        source: value,
      });

      execUpdate();
    },
    onToolCallStreamingStartPart(value) {
      if (message.toolInvocations == null) {
        message.toolInvocations = [];
      }

      // add the partial tool call to the map
      partialToolCalls[value.toolCallId] = {
        text: '',
        step,
        toolName: value.toolName,
        index: message.toolInvocations.length,
      };

      const invocation = {
        state: 'partial-call',
        step,
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        args: undefined,
      } as const;

      message.toolInvocations.push(invocation);

      updateToolInvocationPart(value.toolCallId, invocation);

      execUpdate();
    },
    onToolCallDeltaPart(value) {
      const partialToolCall = partialToolCalls[value.toolCallId];

      partialToolCall.text += value.argsTextDelta;

      const { value: partialArgs } = parsePartialJson(partialToolCall.text);

      const invocation = {
        state: 'partial-call',
        step: partialToolCall.step,
        toolCallId: value.toolCallId,
        toolName: partialToolCall.toolName,
        args: partialArgs,
      } as const;

      message.toolInvocations![partialToolCall.index] = invocation;

      updateToolInvocationPart(value.toolCallId, invocation);

      execUpdate();
    },
    async onToolCallPart(value) {
      const invocation = {
        state: 'call',
        step,
        ...value,
      } as const;

      if (partialToolCalls[value.toolCallId] != null) {
        // change the partial tool call to a full tool call
        message.toolInvocations![partialToolCalls[value.toolCallId].index] =
          invocation;
      } else {
        if (message.toolInvocations == null) {
          message.toolInvocations = [];
        }

        message.toolInvocations.push(invocation);
      }

      updateToolInvocationPart(value.toolCallId, invocation);

      execUpdate();

      // invoke the onToolCall callback if it exists. This is blocking.
      // In the future we should make this non-blocking, which
      // requires additional state management for error handling etc.
      if (onToolCall) {
        const result = await onToolCall({ toolCall: value });
        if (result != null) {
          const invocation = {
            state: 'result',
            step,
            ...value,
            result,
          } as const;

          // store the result in the tool invocation
          message.toolInvocations![message.toolInvocations!.length - 1] =
            invocation;

          updateToolInvocationPart(value.toolCallId, invocation);

          execUpdate();
        }
      }
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

      const invocation = {
        ...toolInvocations[toolInvocationIndex],
        state: 'result' as const,
        ...value,
      } as const;

      toolInvocations[toolInvocationIndex] = invocation;

      updateToolInvocationPart(value.toolCallId, invocation);

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

      // reset the current text and reasoning parts
      currentTextPart = value.isContinued ? currentTextPart : undefined;
      currentReasoningPart = undefined;
      currentReasoningTextDetail = undefined;
    },
    onStartStepPart(value) {
      // keep message id stable when we are updating an existing message:
      if (!replaceLastMessage) {
        message.id = value.messageId;
      }

      // add a step boundary part to the message
      message.parts.push({ type: 'step-start' });
      execUpdate();
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
