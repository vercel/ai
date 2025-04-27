import { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import type { JSONValue, UIMessage, UseChatOptions } from '../types';
import {
  calculateLanguageModelUsage,
  LanguageModelUsage,
} from '../types/duplicated/usage';
import { ChatStore } from './chat-store';
import { processDataStream } from './process-data-stream';

type LocalState = {
  messageAnnotations: JSONValue[];
  usage: LanguageModelUsage;
  finishReason: LanguageModelV2FinishReason;
};

export async function processChatResponseV2({
  chatId,
  stream,
  update,
  onToolCall,
  onFinish,
  generateId = generateIdFunction,
  store,
}: {
  chatId: string;
  stream: ReadableStream<Uint8Array>;
  update: (options: { data: JSONValue[] | undefined }) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    message: UIMessage | undefined;
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelUsage;
  }) => void;
  generateId?: () => string;
  store: ChatStore;
}) {
  const data: JSONValue[] = [];

  const lastMessage = store.getLastMessage(chatId);
  const replaceLastMessage = lastMessage?.role === 'assistant';

  const localState: LocalState = {
    // We keep track of message annotation locally because they may be returned before the active response is created (before native parts are processed):
    messageAnnotations: replaceLastMessage
      ? (lastMessage?.annotations ?? [])
      : [],
    usage: {
      completionTokens: NaN,
      promptTokens: NaN,
      totalTokens: NaN,
    },
    finishReason: 'unknown',
  };

  const updateMessageStore = (partDelta: UIMessage['parts'][number]) => {
    update({ data: [] }); // TODO: Sets status to streaming (SWR), we should separate data updates from status updates
    store.addOrUpdateAssistantMessageParts({
      chatId,
      partDelta,
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

      // Invoke onToolCall callback if it exists. This is blocking.
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
      localState.messageAnnotations.push(...value);

      // If annotations precede message creation, we do a final check in onFinishMessagePart to ensure annotations are added:
      const lastMessage = store.getLastMessage(chatId);
      if (lastMessage != null && lastMessage.role === 'assistant') {
        store.updateActiveResponse({
          chatId,
          message: {
            annotations: [...localState.messageAnnotations],
          },
        });
      }
    },
    onFinishStepPart(value) {
      console.log('onFinishStepPart', value);
      store.incrementStep(chatId);
      store.resetTempParts({ id: chatId, isContinued: value.isContinued });
    },
    onStartStepPart(value) {
      // Add a step boundary part to the message
      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'step-start',
        },
        // Keep message id stable when we are updating an existing message:
        messageId: !replaceLastMessage ? value.messageId : undefined,
      });
    },
    onFinishMessagePart(value) {
      localState.finishReason = value.finishReason;
      if (value.usage != null) {
        localState.usage = calculateLanguageModelUsage(value.usage);
      }

      // Check if we need to add annotations:
      if (localState.messageAnnotations.length > 0) {
        const lastMessage = store.getLastMessage(chatId);
        if (lastMessage?.role === 'assistant' && !lastMessage?.annotations) {
          store.updateActiveResponse({
            chatId,
            message: {
              annotations: [...localState.messageAnnotations],
            },
          });
        }
      }
    },
    onErrorPart(error) {
      throw new Error(error);
    },
  });

  onFinish?.({
    message: store.getLastMessage(chatId),
    finishReason: localState.finishReason,
    usage: localState.usage,
  });
}
