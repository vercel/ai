import { JSONValue, LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { LanguageModelUsage } from '../../core/types/usage';
import { processDataStream } from '../data-stream/process-data-stream';
import { ChatStore } from './chat-store';
import type { UIMessage } from './ui-messages';
import { UseChatOptions } from './use-chat';

type LocalState = {
  messageAnnotations?: JSONValue[];
  usage: LanguageModelUsage;
  finishReason: LanguageModelV2FinishReason;
};

export async function processChatResponse({
  stream,
  updateData,
  onToolCall,
  onFinish,
  store,
  chatId,
}: {
  stream: ReadableStream<Uint8Array>;
  updateData: (data?: JSONValue[]) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    message: UIMessage | undefined;
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelUsage;
  }) => void;
  store: ChatStore;
  chatId: string;
}) {
  const data: JSONValue[] = [];

  const lastMessage = store.getLastMessage(chatId);
  const replaceLastMessage = lastMessage?.role === 'assistant';

  const localState: LocalState = {
    // We keep track of message annotation locally because they may be returned before the active response is created (before native parts are processed):
    messageAnnotations: replaceLastMessage
      ? lastMessage?.annotations
      : undefined,
    usage: {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    },
    finishReason: 'unknown',
  };

  await processDataStream({
    stream,
    onStreamStart() {
      store.setStatus({
        id: chatId,
        status: 'streaming',
      });
    },
    async onTextPart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'text',
          text: value,
        },
      });
    },
    async onReasoningPart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: value.text,
          providerMetadata: value.providerMetadata,
        },
      });
    },
    async onReasoningPartFinish() {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: '',
          providerMetadata: undefined,
        },
      });
    },
    async onFilePart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'file',
          mediaType: value.mediaType,
          url: value.url,
        },
      });
    },
    async onSourcePart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'source',
          source: value,
        },
      });
    },
    async onToolCallStreamingStartPart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'partial-call',
            toolCallId: value.toolCallId,
            toolName: value.toolName,
            args: undefined,
          },
        },
      });
    },
    async onToolCallDeltaPart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'partial-call',
            toolCallId: value.toolCallId,
            toolName: '',
            args: value.argsTextDelta,
          },
        },
      });
    },
    async onToolCallPart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'call',
            ...value,
          },
        },
      });

      // invoke the onToolCall callback if it exists. This is blocking.
      // In the future we should make this non-blocking, which
      // requires additional state management for error handling etc.
      if (onToolCall) {
        const result = await onToolCall({
          toolCall: value,
        });
        if (result != null) {
          store.addOrUpdateAssistantMessageParts({
            chatId,
            partDelta: {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                ...value,
                result,
              },
            },
          });
        }
      }
    },
    async onToolResultPart(value) {
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            ...value,
          },
        },
      });
    },
    onDataPart(value) {
      data.push(...value);
      updateData(data);
    },
    onMessageAnnotationsPart(value) {
      const { messageAnnotations } = localState;

      if (messageAnnotations == null) {
        localState.messageAnnotations = [...value];
      } else {
        localState.messageAnnotations?.push(...value);
      }

      const lastMessage = store.getLastMessage(chatId);

      if (
        lastMessage != null &&
        lastMessage.role === 'assistant' &&
        localState.messageAnnotations != null
      ) {
        store.updateActiveResponse({
          chatId,
          message: {
            annotations: [...localState.messageAnnotations],
          },
        });
      }
    },
    onFinishStepPart(value) {
      store.clearStepPartialState({
        id: chatId,
        isContinued: value.isContinued,
      });
    },
    async onStartStepPart(value) {
      // Add a step boundary part to the message
      await store.addOrUpdateAssistantMessageParts({
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
        localState.usage = value.usage as LanguageModelUsage;
      }

      // Check if we need to add annotations:
      if (localState.messageAnnotations != null) {
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

  const message = store.getLastMessage(chatId);

  if (message != null && 'revisionId' in message) {
    delete message.revisionId;
  }

  onFinish?.({
    message,
    finishReason: localState.finishReason,
    usage: localState.usage,
  });
}
