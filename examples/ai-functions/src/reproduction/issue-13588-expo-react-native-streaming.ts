import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import assert from 'node:assert/strict';

// Based on https://github.com/vercel/ai/pull/21760. All responses are mocked;
// no provider credentials or network requests are needed.
const expectedText = 'Hello from a successful response.';

const openAIStreamBody = [
  `data: ${JSON.stringify({
    id: 'chatcmpl-issue-13588',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen/qwen3.5-9b',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: expectedText },
        finish_reason: null,
      },
    ],
  })}\n\n`,
  `data: ${JSON.stringify({
    id: 'chatcmpl-issue-13588',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen/qwen3.5-9b',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })}\n\n`,
  'data: [DONE]\n\n',
].join('');

const googleStreamBody = `data: ${JSON.stringify({
  candidates: [
    {
      content: {
        parts: [{ text: expectedText }],
        role: 'model',
      },
      finishReason: 'STOP',
      index: 0,
    },
  ],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 1,
    totalTokenCount: 2,
  },
})}\n\n`;

const successfulFetch: typeof fetch = async (input, init) => {
  const url = input.toString();
  const requestBody =
    typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

  if (url.includes(':streamGenerateContent')) {
    return new Response(googleStreamBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  if (url.endsWith('/chat/completions') && requestBody?.stream === true) {
    return new Response(openAIStreamBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  if (url.endsWith('/chat/completions')) {
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-issue-13588',
        object: 'chat.completion',
        created: 0,
        model: 'qwen/qwen3.5-9b',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: expectedText },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  throw new Error(`Unexpected request URL: ${url}`);
};

const openai = createOpenAI({
  baseURL: 'http://127.0.0.1:1234/v1',
  apiKey: 'lm-studio',
  fetch: successfulFetch,
});

const google = createGoogleGenerativeAI({
  apiKey: 'test-google-api-key',
  fetch: successfulFetch,
});

async function readStream(model: Parameters<typeof streamText>[0]['model']) {
  let text = '';
  let streamError: unknown;
  const { textStream } = streamText({
    model,
    prompt: 'Write a poem about embedding models.',
    onError: ({ error }) => {
      streamError = error;
    },
  });

  for await (const textPart of textStream) {
    text += textPart;
  }

  return { error: streamError, text };
}

async function main() {
  const originalTextDecoderStream = globalThis.TextDecoderStream;

  const openAIControl = await readStream(openai.chat('qwen/qwen3.5-9b'));
  assert.equal(openAIControl.error, undefined);
  assert.equal(openAIControl.text, expectedText);

  const googleControl = await readStream(google.chat('gemini-2.5-flash'));
  assert.equal(googleControl.error, undefined);
  assert.equal(googleControl.text, expectedText);

  Object.defineProperty(globalThis, 'TextDecoderStream', {
    configurable: true,
    value: undefined,
    writable: true,
  });

  try {
    const nonStreamingResult = await generateText({
      model: openai.chat('qwen/qwen3.5-9b'),
      prompt: 'Write a poem about embedding models.',
    });
    assert.equal(
      nonStreamingResult.text,
      expectedText,
      'generateText must still process a successful response.',
    );

    for (const [providerName, model] of [
      ['OpenAI-compatible', openai.chat('qwen/qwen3.5-9b')],
      ['Google', google.chat('gemini-2.5-flash')],
    ] as const) {
      const { error, text } = await readStream(model);

      assert.equal(
        error,
        undefined,
        `${providerName} streamText must process the successful response without TextDecoderStream.`,
      );
      assert.equal(
        text,
        expectedText,
        `${providerName} streamText must consume the successful SSE response.`,
      );
    }
  } finally {
    Object.defineProperty(globalThis, 'TextDecoderStream', {
      configurable: true,
      value: originalTextDecoderStream,
      writable: true,
    });
  }

  console.log('Issue #13588: both providers stream without TextDecoderStream.');
}

await main();
