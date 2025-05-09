import { JSONValue } from '@ai-sdk/provider';
import { IdGenerator } from '@ai-sdk/provider-utils';
import { ChatStore } from '.';
import { processChatResponse } from './process-chat-response';
import { processChatTextResponse } from './process-chat-text-response';
import { UseChatOptions } from './use-chat';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function callChatApi({
  api,
  body,
  streamProtocol = 'data',
  credentials,
  headers,
  abortController,
  onResponse,
  onUpdateData,
  onFinish,
  onToolCall,
  generateId,
  fetch = getOriginalFetch(),
  requestType = 'generate',
  store,
  chatId,
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'data' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  onResponse: ((response: Response) => void | Promise<void>) | undefined;
  onUpdateData: (data?: JSONValue[]) => void;
  onFinish: UseChatOptions['onFinish'];
  onToolCall: UseChatOptions['onToolCall'];
  generateId: IdGenerator;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  requestType?: 'generate' | 'resume';
  store: ChatStore;
  chatId: string;
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

  if (onResponse != null) {
    await onResponse(response);
  }

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
      await processChatTextResponse({
        stream: response.body,
        updateData: onUpdateData,
        onFinish,
        store,
        chatId,
        generateId,
      });
      return;
    }

    case 'data': {
      await processChatResponse({
        stream: response.body,
        updateData: onUpdateData,
        onToolCall,
        onFinish({ message, finishReason, usage }) {
          if (onFinish && message != null) {
            onFinish(message, { usage, finishReason });
          }
        },
        store,
        chatId,
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
