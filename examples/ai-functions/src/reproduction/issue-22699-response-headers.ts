import assert from 'node:assert/strict';
import { callCompletionApi, DefaultChatTransport } from 'ai';

type ApiError = Error & {
  requestBodyValues?: unknown;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
};

const responseWithHeaders = () =>
  new Response('Please retry later', {
    status: 429,
    headers: {
      'Retry-After': '15',
      'X-Request-ID': 'fixture-request',
    },
  });

function assertApiError(
  error: unknown,
  scenario: string,
  expectedResponseBody: string,
): ApiError {
  assert.ok(error instanceof Error, `${scenario} did not produce an Error`);
  assert.equal(error.name, 'AI_APICallError');

  const apiError = error as ApiError;
  assert.equal(apiError.statusCode, 429);
  assert.equal(apiError.responseBody, expectedResponseBody);
  assert.equal(apiError.requestBodyValues, undefined);
  return apiError;
}

function hasPreservedHeaders(error: ApiError): boolean {
  return (
    error.responseHeaders?.['retry-after'] === '15' &&
    error.responseHeaders?.['x-request-id'] === 'fixture-request'
  );
}

async function getChatSendError(): Promise<ApiError> {
  const transport = new DefaultChatTransport({
    api: 'https://example.invalid/chat',
    fetch: async () => responseWithHeaders(),
  });

  try {
    await transport.sendMessages({
      chatId: 'chat',
      messageId: undefined,
      messages: [],
      trigger: 'submit-message',
      abortSignal: undefined,
    });
  } catch (error) {
    return assertApiError(error, 'chat send', 'Please retry later');
  }

  throw new Error('chat send unexpectedly succeeded');
}

async function getChatReconnectError(): Promise<ApiError> {
  const transport = new DefaultChatTransport({
    api: 'https://example.invalid/chat',
    fetch: async () => responseWithHeaders(),
  });

  try {
    await transport.reconnectToStream({ chatId: 'chat' });
  } catch (error) {
    return assertApiError(error, 'chat reconnect', 'Please retry later');
  }

  throw new Error('chat reconnect unexpectedly succeeded');
}

async function getCompletionError(): Promise<ApiError> {
  let completionError: Error | undefined;

  await callCompletionApi({
    api: 'https://example.invalid/completion',
    prompt: 'hello',
    credentials: undefined,
    headers: undefined,
    body: {},
    streamProtocol: 'text',
    setCompletion: () => {},
    setLoading: () => {},
    setError: error => {
      if (error != null) {
        completionError = error;
      }
    },
    setAbortController: () => {},
    onFinish: undefined,
    onError: undefined,
    fetch: async () => responseWithHeaders(),
  });

  return assertApiError(completionError, 'completion', 'Please retry later');
}

async function getEmptyHeaderError(): Promise<ApiError> {
  const transport = new DefaultChatTransport({
    api: 'https://example.invalid/chat',
    fetch: async () => new Response(null, { status: 429 }),
  });

  try {
    await transport.sendMessages({
      chatId: 'chat',
      messageId: undefined,
      messages: [],
      trigger: 'submit-message',
      abortSignal: undefined,
    });
  } catch (error) {
    return assertApiError(error, 'empty-header response', '');
  }

  throw new Error('empty-header response unexpectedly succeeded');
}

async function main() {
  const scenarios = [
    ['chat send', await getChatSendError()],
    ['chat reconnect', await getChatReconnectError()],
    ['completion', await getCompletionError()],
  ] as const;

  const failures: string[] = scenarios
    .filter(([, error]) => !hasPreservedHeaders(error))
    .map(([scenario]) => scenario);

  const emptyHeaderError = await getEmptyHeaderError();
  if (
    emptyHeaderError.responseHeaders == null ||
    Object.keys(emptyHeaderError.responseHeaders).length !== 0
  ) {
    failures.push('empty-header response');
  }

  if (failures.length > 0) {
    console.error(
      `ISSUE_22699_RESPONSE_HEADERS_MISSING: ${failures.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Response headers were preserved for chat send, reconnect, completion, and empty-header errors.',
  );
}

await main();
