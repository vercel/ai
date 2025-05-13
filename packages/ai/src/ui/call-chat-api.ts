import {
  IdGenerator,
  parseJsonEventStream,
  ParseResult,
  Schema,
} from '@ai-sdk/provider-utils';
import {
  UIMessageStreamPart,
  uiMessageStreamPartSchema,
} from '../ui-message-stream/ui-message-stream-parts';
import { consumeStream } from '../util/consume-stream';
import { ChatStore } from './chat-store';
import { processChatTextResponse } from './process-chat-text-response';
import { processUIMessageStream } from './process-ui-message-stream';
import { type UseChatOptions } from './use-chat';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function callChatApi<MESSAGE_METADATA>({
  api,
  body,
  streamProtocol = 'ui-message',
  credentials,
  headers,
  abortController,
  onFinish,
  onToolCall,
  generateId,
  fetch = getOriginalFetch(),
  requestType = 'generate',
  messageMetadataSchema,
  chatId,
  store,
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'ui-message' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  onFinish: UseChatOptions<MESSAGE_METADATA>['onFinish'];
  onToolCall: UseChatOptions<MESSAGE_METADATA>['onToolCall'];
  generateId: IdGenerator;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  requestType?: 'generate' | 'resume';
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
  chatId: string;
  store: ChatStore;
}) {
  const response =
    requestType === 'resume'
      ? await fetch(`${api}?chatId=${chatId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
          credentials,
        })
      : await fetch(api, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
          credentials,
        });

  if (!response.ok) {
    throw new Error(
      (await response.text()) ?? 'Failed to fetch the chat response.',
    );
  }

  if (!response.body) {
    throw new Error('The response body is empty.');
  }

  switch (streamProtocol) {
    case 'text': {
      await processChatTextResponse<MESSAGE_METADATA>({
        stream: response.body,
        onFinish,
        store,
        chatId,
        generateId,
        update: () => {}, // todo: fix
      });
      return;
    }

    case 'ui-message': {
      // TODO check protocol version header

      await consumeStream({
        stream: processUIMessageStream({
          stream: parseJsonEventStream({
            stream: response.body,
            schema: uiMessageStreamPartSchema,
          }).pipeThrough(
            new TransformStream<
              ParseResult<UIMessageStreamPart>,
              UIMessageStreamPart
            >({
              async transform(part, controller) {
                if (!part.success) {
                  throw part.error;
                }
                controller.enqueue(part.value);
              },
            }),
          ),
          onToolCall,
          onFinish,
          messageMetadataSchema,
          acquireMessageLock: () => store.acquireMessageLock(chatId),
        }),
        onError: error => {
          throw error;
        },
      });
      return;
    }

    default: {
      const exhaustiveCheck: never = streamProtocol;
      throw new Error(`Unknown stream protocol: ${exhaustiveCheck}`);
    }
  }
}
