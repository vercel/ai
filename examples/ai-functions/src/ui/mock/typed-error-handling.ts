import {
  APICallError,
  callCompletionApi,
  DefaultChatTransport,
  UIMessageStreamError,
} from 'ai';
import { run } from '../../lib/run';

async function main() {
  const transport = new DefaultChatTransport({
    fetch: async () =>
      new Response('Chat service unavailable', { status: 503 }),
  });

  try {
    await transport.sendMessages({
      chatId: 'example-chat',
      messageId: 'example-message',
      trigger: 'submit-message',
      messages: [],
      abortSignal: new AbortController().signal,
    });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      console.log('Chat request status:', error.statusCode);
      console.log('Chat request retryable:', error.isRetryable);
    }
  }

  await callCompletionApi({
    api: '/api/completion',
    prompt: 'Write a greeting',
    credentials: undefined,
    headers: undefined,
    body: {},
    streamProtocol: 'data',
    setCompletion: () => {},
    setLoading: () => {},
    setError: () => {},
    setAbortController: () => {},
    onFinish: undefined,
    onError: error => {
      if (UIMessageStreamError.isInstance(error)) {
        console.log('Completion stream error:', error.message);
      }
    },
    fetch: async () =>
      new Response(
        `data: ${JSON.stringify({
          type: 'error',
          errorText: 'Completion service unavailable',
        })}\n\n`,
      ),
  });
}

run(main);
