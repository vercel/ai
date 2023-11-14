import { Message } from './types';

export async function callApi({
  api,
  messages,
  body,
  credentials,
  headers,
  signal,
  restoreMessagesOnFailure,
  onResponse,
}: {
  api: string;
  messages: Omit<Message, 'id'>[];
  body: Record<string, any>;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
  restoreMessagesOnFailure: () => void;
  onResponse?: (response: Response) => void | Promise<void>;
}) {
  const response = await fetch(api, {
    method: 'POST',
    body: JSON.stringify({
      messages,
      ...body,
    }),
    headers,
    signal,
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

  return {
    response,
    reader: response.body.getReader(),
  };
}
