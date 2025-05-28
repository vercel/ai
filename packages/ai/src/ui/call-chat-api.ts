import { parseJsonEventStream, ParseResult } from '@ai-sdk/provider-utils';
import {
  UIMessageStreamPart,
  uiMessageStreamPartSchema,
} from '../ui-message-stream/ui-message-stream-parts';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function fetchUIMessageStream({
  api,
  body,
  credentials,
  headers,
  abortController,
  fetch = getOriginalFetch(),
  requestType = 'generate',
}: {
  api: string;
  body: Record<string, any>;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  requestType?: 'generate' | 'resume';
}): Promise<ReadableStream<UIMessageStreamPart>> {
  const response =
    requestType === 'resume'
      ? await fetch(`${api}?chatId=${body.chatId}`, {
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

  return parseJsonEventStream({
    stream: response.body,
    schema: uiMessageStreamPartSchema,
  }).pipeThrough(
    new TransformStream<ParseResult<UIMessageStreamPart>, UIMessageStreamPart>({
      async transform(part, controller) {
        if (!part.success) {
          throw part.error;
        }
        controller.enqueue(part.value);
      },
    }),
  );
}
