import { IdGenerator, JSONValue, UseChatOptions } from '../types';
import { MessagesStore } from './messages-store';
import { processChatResponseV2 } from './process-chat-response-v2';
import { processChatTextResponse } from './process-chat-text-response';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function callChatApiV2({
  api,
  body,
  streamProtocol = 'data',
  credentials,
  headers,
  abortController,
  restoreMessagesOnFailure,
  onResponse,
  onUpdate,
  onFinish,
  onToolCall,
  generateId,
  fetch = getOriginalFetch(),
  store,
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'data' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  restoreMessagesOnFailure: () => void;
  onResponse: ((response: Response) => void | Promise<void>) | undefined;
  onUpdate: (options: { data: JSONValue[] | undefined }) => void;
  onFinish: UseChatOptions['onFinish'];
  onToolCall: UseChatOptions['onToolCall'];
  generateId: IdGenerator;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  store: MessagesStore;
}) {
  const response = await fetch(api, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    signal: abortController?.()?.signal,
    credentials,
  }).catch(err => {
    restoreMessagesOnFailure();
    throw err;
  });

  if (onResponse) {
    try {
      await onResponse(response);
    } catch (err) {
      throw err;
    }
  }

  if (!response.ok) {
    restoreMessagesOnFailure();
    throw new Error(
      (await response.text()) ?? 'Failed to fetch the chat response.',
    );
  }

  if (!response.body) {
    throw new Error('The response body is empty.');
  }

  switch (streamProtocol) {
    case 'text': {
      await processChatTextResponse({
        stream: response.body,
        update: onUpdate,
        onFinish,
        generateId,
      });
      return;
    }

    case 'data': {
      // Sets status to streaming:
      onUpdate({ data: [] });
      await processChatResponseV2({
        stream: response.body,
        update: onUpdate,
        store,
        onToolCall,
        onFinish({ message, finishReason, usage }) {
          if (onFinish && message != null) {
            onFinish(message, { usage, finishReason });
          }
        },
        generateId,
      });
      return;
    }

    default: {
      const exhaustiveCheck: never = streamProtocol;
      throw new Error(`Unknown stream protocol: ${exhaustiveCheck}`);
    }
  }
}
