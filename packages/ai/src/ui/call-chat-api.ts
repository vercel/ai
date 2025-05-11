import { IdGenerator, Schema } from '@ai-sdk/provider-utils';
import { parseEncodedDataStream } from '../data-stream/parse-encoded-data-stream';
import { processChatResponse } from './process-chat-response';
import { processChatTextResponse } from './process-chat-text-response';
import { UIMessage } from './ui-messages';
import { UseChatOptions } from './use-chat';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function callChatApi<MESSAGE_METADATA = any>({
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
  requestType = 'generate',
  messageMetadataSchema,
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'data' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  onResponse: ((response: Response) => void | Promise<void>) | undefined;
  onUpdate: (options: { message: UIMessage }) => void;
  onFinish: UseChatOptions['onFinish'];
  onToolCall: UseChatOptions['onToolCall'];
  generateId: IdGenerator;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  lastMessage: UIMessage | undefined;
  requestType?: 'generate' | 'resume';
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
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
      });
      return;
    }

    case 'data': {
      // TODO check protocol version header

      await processChatResponse({
        stream: parseEncodedDataStream({
          stream: response.body,
          onError: error => {
            throw error;
          },
        }),
        update: onUpdate,
        lastMessage,
        onToolCall,
        onFinish,
        generateId,
        messageMetadataSchema,
      });
      return;
    }

    default: {
      const exhaustiveCheck: never = streamProtocol;
      throw new Error(`Unknown stream protocol: ${exhaustiveCheck}`);
    }
  }
}
