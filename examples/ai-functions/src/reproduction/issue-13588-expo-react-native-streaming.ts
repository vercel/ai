import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

const EXPECTED_TEXT = 'Embedding models sing.';
const FAILURE_SIGNAL =
  'ISSUE_13588_REPRODUCED: Expo-like streamText failed on successful HTTP 200 SSE responses';

const openAIResponse = ({ stream }: { stream: boolean }) =>
  stream
    ? new Response(
        [
          `data: ${JSON.stringify({
            id: 'chatcmpl-reproduction',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'qwen/qwen3.5-9b',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: EXPECTED_TEXT },
                finish_reason: 'stop',
              },
            ],
          })}\n\n`,
          'data: [DONE]\n\n',
        ].join(''),
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      )
    : Response.json({
        id: 'chatcmpl-reproduction',
        object: 'chat.completion',
        created: 1,
        model: 'qwen/qwen3.5-9b',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: EXPECTED_TEXT },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 4,
          total_tokens: 9,
        },
      });

const googleResponse = ({ stream }: { stream: boolean }) => {
  const body = {
    candidates: [
      {
        content: {
          parts: [{ text: EXPECTED_TEXT }],
          role: 'model',
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 5,
      candidatesTokenCount: 4,
      totalTokenCount: 9,
    },
  };

  return stream
    ? new Response(`data: ${JSON.stringify(body)}\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    : Response.json(body);
};

const openai = createOpenAI({
  baseURL: 'http://lm-studio.test/v1',
  apiKey: 'lm-studio',
  fetch: async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { stream?: boolean };
    return openAIResponse({ stream: request.stream === true });
  },
});

const google = createGoogleGenerativeAI({
  apiKey: 'test-key',
  fetch: async url =>
    googleResponse({ stream: String(url).includes(':streamGenerateContent') }),
});

const providers = [
  {
    name: 'OpenAI-compatible LM Studio',
    model: openai.chat('qwen/qwen3.5-9b'),
  },
  {
    name: 'Google Gemini',
    model: google.chat('gemini-2.5-flash'),
  },
] as const;

async function collectStream(model: (typeof providers)[number]['model']) {
  let observedError: unknown;

  const { textStream } = streamText({
    model,
    prompt: 'Write a poem about embedding models.',
    onError: ({ error }) => {
      observedError ??= error;
    },
  });

  let text = '';
  try {
    for await (const textPart of textStream) {
      text += textPart;
    }
  } catch (error) {
    observedError ??= error;
  }

  return { error: observedError, text };
}

function assertExpectedText({
  provider,
  mode,
  text,
}: {
  provider: string;
  mode: string;
  text: string;
}) {
  if (text !== EXPECTED_TEXT) {
    throw new Error(
      `${provider} ${mode} returned ${JSON.stringify(text)} instead of ${JSON.stringify(EXPECTED_TEXT)}`,
    );
  }
}

function setTextDecoderStream(value: typeof TextDecoderStream | undefined) {
  Object.defineProperty(globalThis, 'TextDecoderStream', {
    configurable: true,
    writable: true,
    value,
  });
}

function isReportedFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = (error as Error & { cause?: unknown }).cause;

  return (
    error.name === 'AI_APICallError' &&
    error.message === 'Failed to process successful response' &&
    cause instanceof TypeError &&
    cause.message.includes('TextDecoderStream is not a constructor')
  );
}

async function main() {
  const nativeTextDecoderStream = globalThis.TextDecoderStream;

  if (typeof nativeTextDecoderStream !== 'function') {
    throw new Error(
      'The Node.js control runtime must provide TextDecoderStream.',
    );
  }

  for (const provider of providers) {
    const result = await collectStream(provider.model);

    if (result.error != null) {
      throw result.error;
    }

    assertExpectedText({
      provider: provider.name,
      mode: 'Node-like streamText',
      text: result.text,
    });
  }

  const streamResults: Array<
    | { name: string; success: true; text: string }
    | { name: string; success: false; error: unknown }
  > = [];

  setTextDecoderStream(undefined);

  try {
    for (const provider of providers) {
      const generated = await generateText({
        model: provider.model,
        prompt: 'Write a poem about embedding models.',
      });

      assertExpectedText({
        provider: provider.name,
        mode: 'Expo-like generateText',
        text: generated.text,
      });

      const result = await collectStream(provider.model);

      if (result.error == null) {
        streamResults.push({
          name: provider.name,
          success: true,
          text: result.text,
        });
      } else {
        streamResults.push({
          name: provider.name,
          success: false,
          error: result.error,
        });
      }
    }
  } finally {
    setTextDecoderStream(nativeTextDecoderStream);
  }

  const failures = streamResults.filter(
    (result): result is { name: string; success: false; error: unknown } =>
      !result.success,
  );

  if (failures.length === 0) {
    for (const result of streamResults) {
      if (!result.success) {
        throw result.error;
      }

      assertExpectedText({
        provider: result.name,
        mode: 'Expo-like streamText',
        text: result.text,
      });
    }

    console.log('Expo-like streamText produced text for both providers.');
    return;
  }

  const unexpectedFailure = failures.find(
    result => !isReportedFailure(result.error),
  );

  if (unexpectedFailure != null) {
    throw unexpectedFailure.error;
  }

  const successfulProvider = streamResults.find(result => result.success);
  if (successfulProvider != null) {
    throw new Error(
      `${successfulProvider.name} streamed successfully while another reported provider failed.`,
    );
  }

  console.error(FAILURE_SIGNAL);
  console.error(
    failures
      .map(result => `${result.name}: ${(result.error as Error).message}`)
      .join('\n'),
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
