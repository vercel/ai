import { processChatResponse } from './process-chat-response';
import { processChatTextResponse } from './process-chat-text-response';
import {
  IdGenerator,
  JSONValue,
  onParts,
  UIMessage,
  UseChatOptions,
} from './types';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function callChatApi({
  api,
  body,
  streamProtocol = 'data',
  credentials,
  headers,
  abortController,
  restoreMessagesOnFailure,
  onParts,
  onResponse,
  onUpdate,
  onFinish,
  onToolCall,
  generateId,
  fetch = getOriginalFetch(),
  lastMessage,
  requestType = 'generate',
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'data' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  restoreMessagesOnFailure: () => void;
  onParts?: onParts;
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
  requestType?: 'generate' | 'resume';
}) {
  const request =
    requestType === 'resume'
      ? fetch(`${api}?chatId=${body.id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
          credentials,
        })
      : fetch(api, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
          credentials,
        });

  const response = await request.catch(err => {
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
      await processChatResponse({
        stream: response.body,
        update: onUpdate,
        lastMessage,
        onToolCall,
        onParts,
        async onFinish({ message, finishReason, usage }) {
          if (onFinish && message != null) {
            await onFinish(message, { usage, finishReason });
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
