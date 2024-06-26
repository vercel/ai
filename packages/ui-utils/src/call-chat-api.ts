import { parseComplexResponse } from './parse-complex-response';
import { IdGenerator, JSONValue, Message, UseChatOptions } from './types';
import { createChunkDecoder } from './index';

export async function callChatApi({
  api,
  messages,
  body,
  streamMode = 'stream-data',
  credentials,
  headers,
  abortController,
  restoreMessagesOnFailure,
  onResponse,
  onUpdate,
  onFinish,
  onToolCall,
  generateId,
}: {
  api: string;
  messages: Omit<Message, 'id'>[];
  body: Record<string, any>;
  streamMode?: 'stream-data' | 'text';
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  abortController?: () => AbortController | null;
  restoreMessagesOnFailure: () => void;
  onResponse?: (response: Response) => void | Promise<void>;
  onUpdate: (merged: Message[], data: JSONValue[] | undefined) => void;
  onFinish?: (message: Message) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  generateId: IdGenerator;
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
      (await response.text()) || 'Failed to fetch the chat response.',
    );
  }

  if (!response.body) {
    throw new Error('The response body is empty.');
  }

  const reader = response.body.getReader();

  switch (streamMode) {
    case 'text': {
      const decoder = createChunkDecoder();

      const resultMessage = {
        id: generateId(),
        createdAt: new Date(),
        role: 'assistant' as const,
        content: '',
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        resultMessage.content += decoder(value);
        resultMessage.id = generateId();

        // note: creating a new message object is required for Solid.js streaming
        onUpdate([{ ...resultMessage }], []);

        // The request has been aborted, stop reading the stream.
        if (abortController?.() === null) {
          reader.cancel();
          break;
        }
      }

      onFinish?.(resultMessage);

      return {
        messages: [resultMessage],
        data: [],
      };
    }

    case 'stream-data': {
      return await parseComplexResponse({
        reader,
        abortControllerRef:
          abortController != null ? { current: abortController() } : undefined,
        update: onUpdate,
        onToolCall,
        onFinish(prefixMap) {
          if (onFinish && prefixMap.text != null) {
            onFinish(prefixMap.text);
          }
        },
        generateId,
      });
    }

    default: {
      const exhaustiveCheck: never = streamMode;
      throw new Error(`Unknown stream mode: ${exhaustiveCheck}`);
    }
  }
}
