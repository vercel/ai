import { createChunkDecoder } from './index';
import { parseComplexResponse } from './parse-complex-response';
import { IdGenerator, JSONValue, Message, UseChatOptions } from './types';

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
  onResponse,
  onUpdate,
  onFinish,
  onToolCall,
  generateId,
  fetch = getOriginalFetch(),
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'data' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  restoreMessagesOnFailure: () => void;
  onResponse: ((response: Response) => void | Promise<void>) | undefined;
  onUpdate: (merged: Message[], data: JSONValue[] | undefined) => void;
  onFinish: UseChatOptions['onFinish'];
  onToolCall: UseChatOptions['onToolCall'];
  generateId: IdGenerator;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
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

  const reader = response.body.getReader();

  switch (streamProtocol) {
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

        // note: creating a new message object is required for Solid.js streaming
        onUpdate([{ ...resultMessage }], []);

        // The request has been aborted, stop reading the stream.
        if (abortController?.() === null) {
          reader.cancel();
          break;
        }
      }

      // in text mode, we don't have usage information or finish reason:
      onFinish?.(resultMessage, {
        usage: { completionTokens: NaN, promptTokens: NaN, totalTokens: NaN },
        finishReason: 'unknown',
      });

      return {
        messages: [resultMessage],
        data: [],
      };
    }

    case 'data': {
      return await parseComplexResponse({
        reader,
        abortControllerRef:
          abortController != null ? { current: abortController() } : undefined,
        update: onUpdate,
        onToolCall,
        onFinish({ prefixMap, finishReason, usage }) {
          if (onFinish && prefixMap.text != null) {
            onFinish(prefixMap.text, { usage, finishReason });
          }
        },
        generateId,
      });
    }

    default: {
      const exhaustiveCheck: never = streamProtocol;
      throw new Error(`Unknown stream protocol: ${exhaustiveCheck}`);
    }
  }
}
