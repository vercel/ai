import { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import type { JSONValue, UIMessage, UseChatOptions } from '../types';
import {
  calculateLanguageModelUsage,
  LanguageModelUsage,
} from '../types/duplicated/usage';
import { MessagesStore } from './messages-store';
import { processDataStream } from './process-data-stream';

export async function processChatResponseV2({
  stream,
  update,
  onToolCall,
  onFinish,
  generateId = generateIdFunction,
  store,
}: {
  stream: ReadableStream<Uint8Array>;
  update: (options: { data: JSONValue[] | undefined }) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    message: UIMessage | undefined;
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelUsage;
  }) => void;
  generateId?: () => string;
  store: MessagesStore;
}) {
  const lastMessage = store.getLastMessage();
  const replaceLastMessage = lastMessage?.role === 'assistant';
  let step = replaceLastMessage
    ? 1 +
      // find max step in existing tool invocations:
      (lastMessage.toolInvocations?.reduce((max, toolInvocation) => {
        return Math.max(max, toolInvocation.step ?? 0);
      }, 0) ?? 0)
    : 0;

  const data: JSONValue[] = [];

  // keep list of current message annotations for message
  let messageAnnotations: JSONValue[] | undefined = replaceLastMessage
    ? lastMessage?.annotations
    : undefined;

  let usage: LanguageModelUsage = {
    completionTokens: NaN,
    promptTokens: NaN,
    totalTokens: NaN,
  };

  let finishReason: LanguageModelV2FinishReason = 'unknown';

  const updateMessageStore = (partDelta: UIMessage['parts'][number]) => {
    store.addOrUpdateAssistantMessageParts({
      partDelta,
      step,
      generateId,
    });
  };

  await processDataStream({
    stream,
    onTextPart(value) {
      updateMessageStore({
        type: 'text',
        text: value,
      });
    },
    onReasoningPart(value) {
      updateMessageStore({
        type: 'reasoning',
        reasoning: value,
        details: [],
      });
    },
    onReasoningSignaturePart(value) {
      updateMessageStore({
        type: 'reasoning',
        reasoning: '',
        details: [
          {
            type: 'text',
            text: '',
            signature: value.signature,
          },
        ],
      });
    },
    onRedactedReasoningPart(value) {
      updateMessageStore({
        type: 'reasoning',
        reasoning: '',
        details: [
          {
            type: 'redacted',
            data: value.data,
          },
        ],
      });
    },
    onFilePart(value) {
      updateMessageStore({
        type: 'file',
        mediaType: value.mimeType,
        data: value.data,
      });
    },
    onSourcePart(value) {
      updateMessageStore({
        type: 'source',
        source: value,
      });
    },
    onToolCallStreamingStartPart(value) {
      updateMessageStore({
        type: 'tool-invocation',
        toolInvocation: {
          state: 'partial-call',
          toolCallId: value.toolCallId,
          toolName: value.toolName,
          args: undefined,
        },
      });
    },
    onToolCallDeltaPart(value) {
      updateMessageStore({
        type: 'tool-invocation',
        toolInvocation: {
          state: 'partial-call',
          toolCallId: value.toolCallId,
          toolName: '',
          args: value.argsTextDelta,
        },
      });
    },
    async onToolCallPart(value) {
      updateMessageStore({
        type: 'tool-invocation',
        toolInvocation: {
          state: 'call',
          ...value,
        },
      });

      // invoke the onToolCall callback if it exists. This is blocking.
      // In the future we should make this non-blocking, which
      // requires additional state management for error handling etc.
      if (onToolCall) {
        const result = await onToolCall({ toolCall: value });
        if (result != null) {
          updateMessageStore({
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              ...value,
              result,
            },
          });
        }
      }
    },
    onToolResultPart(value) {
      updateMessageStore({
        type: 'tool-invocation',
        toolInvocation: {
          state: 'result',
          toolName: '',
          args: undefined,
          ...value,
        },
      });
    },
    onDataPart(value) {
      data.push(...value);
      const copiedData = [...data];
      update({
        data: copiedData,
      });
    },
    onMessageAnnotationsPart(value) {
      if (messageAnnotations == null) {
        messageAnnotations = [...value];
      } else {
        messageAnnotations.push(...value);
      }

      // If annotations precede message creation, we do a final check in onFinishMessagePart to ensure annotations are added:
      const lastMessage = store.getLastMessage();
      if (lastMessage != null && lastMessage.role === 'assistant') {
        store.updateLastMessage({
          ...lastMessage,
          annotations: messageAnnotations,
        });
      }
    },
    onFinishStepPart(value) {
      step += 1;
      store.resetTempParts({ isContinued: value.isContinued });
    },
    onStartStepPart(value) {
      // add a step boundary part to the message
      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'step-start',
        },
        step,
        // keep message id stable when we are updating an existing message:
        id: !replaceLastMessage ? value.messageId : undefined,
      });
    },
    onFinishMessagePart(value) {
      finishReason = value.finishReason;
      if (value.usage != null) {
        usage = calculateLanguageModelUsage(value.usage);
      }

      // Check if we need to add annotations:
      if (messageAnnotations != null) {
        const lastMessage = store.getLastMessage();
        if (!lastMessage?.annotations && lastMessage?.role === 'assistant') {
          store.updateLastMessage({
            ...lastMessage,
            annotations: messageAnnotations,
          });
        }
      }
    },
    onErrorPart(error) {
      throw new Error(error);
    },
  });

  onFinish?.({ message: store.getLastMessage(), finishReason, usage });
}
