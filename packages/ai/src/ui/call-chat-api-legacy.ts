import { JSONValue } from '@ai-sdk/provider';
import { IdGenerator } from '@ai-sdk/provider-utils';
import { processChatResponse } from './process-chat-response-legacy';
import { processChatTextResponse } from './process-chat-text-response-legacy';
import { UIMessage } from './ui-messages';
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
  onUpdate,
  onFinish,
  onToolCall,
  generateId,
  fetch = getOriginalFetch(),
  lastMessage,
  getCurrentDate,
  requestType = 'generate',
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'data' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  onResponse: ((response: Response) => void | Promise<void>) | undefined;
  onUpdate: (options: {
    message: UIMessage;
    data: JSONValue[] | undefined;
    replaceLastMessage: boolean;
  }) => void;
  onFinish: UseChatOptions['onFinish'];
  onToolCall: UseChatOptions['onToolCall'];
  generateId: IdGenerator;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  lastMessage: UIMessage | undefined;
  getCurrentDate: () => Date;
  requestType?: 'generate' | 'resume';
}) {
  const response =
    requestType === 'resume'
      ? await fetch(`${api}?chatId=${body.id}`, {
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
        update: onUpdate,
        onFinish,
        generateId,
        getCurrentDate,
      });
      return;
    }

    case 'data': {
      await processChatResponse({
        stream: response.body,
        update: onUpdate,
        lastMessage,
        onToolCall,
        onFinish({ message, finishReason, usage }) {
          if (onFinish && message != null) {
            onFinish(message, { usage, finishReason });
          }
        },
        generateId,
        getCurrentDate,
      });
      return;
    }

    default: {
      const exhaustiveCheck: never = streamProtocol;
      throw new Error(`Unknown stream protocol: ${exhaustiveCheck}`);
    }
  }
}
