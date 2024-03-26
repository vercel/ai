import { parseComplexResponse } from './parse-complex-response';
import { IdGenerator, JSONValue, Message } from './types';

export async function callChatApi({
  api,
  messages,
  body,
  credentials,
  headers,
  abortController,
  restoreMessagesOnFailure,
  onResponse,
  onUpdate,
  onFinish,
  generateId,
}: {
  api: string;
  messages: Omit<Message, 'id'>[];
  body: Record<string, any>;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  abortController?: () => AbortController | null;
  restoreMessagesOnFailure: () => void;
  onResponse?: (response: Response) => void | Promise<void>;
  onUpdate: (merged: Message[], data: JSONValue[] | undefined) => void;
  onFinish?: (message: Message) => void;
  generateId: IdGenerator;
}) {
  const response = await fetch(api, {
    method: 'POST',
    body: JSON.stringify({
      messages,
      ...body,
    }),
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

  return await parseComplexResponse({
    reader,
    abortControllerRef:
      abortController != null ? { current: abortController() } : undefined,
    update: onUpdate,
    onFinish(prefixMap) {
      if (onFinish && prefixMap.text != null) {
        onFinish(prefixMap.text);
      }
    },
    generateId,
  });
}
