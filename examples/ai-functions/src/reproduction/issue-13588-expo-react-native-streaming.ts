import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, generateText, streamText } from 'ai';
import { strict as assert } from 'node:assert';
import { createServer, type ServerResponse } from 'node:http';

const prompt = 'Write a poem about embedding models.';

async function collectText(
  model: Parameters<typeof streamText>[0]['model'],
): Promise<{ error: unknown; text: string }> {
  let error: unknown;
  let text = '';

  const result = streamText({
    model,
    prompt,
    onError: event => {
      error = event.error;
    },
  });

  for await (const part of result.textStream) {
    text += part;
  }

  return { error, text };
}

function sendJson(response: ServerResponse, body: unknown) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sendSse(response: ServerResponse, chunks: unknown[]) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });

  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  response.end();
}

async function main() {
  const server = createServer(async (request, response) => {
    const bodyChunks: Buffer[] = [];
    for await (const chunk of request) {
      bodyChunks.push(Buffer.from(chunk));
    }

    const body = JSON.parse(Buffer.concat(bodyChunks).toString('utf8')) as {
      stream?: boolean;
    };

    if (request.url === '/v1/chat/completions') {
      if (!body.stream) {
        sendJson(response, {
          id: 'chatcmpl-reproduction',
          object: 'chat.completion',
          created: 1,
          model: 'qwen/qwen3.5-9b',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'OpenAI-compatible non-stream response',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 5,
            total_tokens: 9,
          },
        });
        return;
      }

      sendSse(response, [
        {
          id: 'chatcmpl-reproduction',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'qwen/qwen3.5-9b',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-reproduction',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'qwen/qwen3.5-9b',
          choices: [
            {
              index: 0,
              delta: { content: 'OpenAI-compatible stream response' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-reproduction',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'qwen/qwen3.5-9b',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        },
      ]);
      return;
    }

    if (request.url?.includes(':streamGenerateContent')) {
      sendSse(response, [
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'Google stream response' }],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: [],
            },
          ],
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 3,
            totalTokenCount: 7,
          },
        },
      ]);
      return;
    }

    if (request.url?.includes(':generateContent')) {
      sendJson(response, {
        candidates: [
          {
            content: {
              parts: [{ text: 'Google non-stream response' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: [],
          },
        ],
        usageMetadata: {
          promptTokenCount: 4,
          candidatesTokenCount: 3,
          totalTokenCount: 7,
        },
      });
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address != null && typeof address !== 'string');
    const baseURL = `http://127.0.0.1:${address.port}`;

    const openaiModel = createOpenAI({
      baseURL: `${baseURL}/v1`,
      apiKey: 'lm-studio',
    }).chat('qwen/qwen3.5-9b');
    const googleModel = createGoogleGenerativeAI({
      baseURL,
      apiKey: 'test-api-key',
    }).chat('gemini-2.5-flash');

    assert.deepEqual(await collectText(openaiModel), {
      error: undefined,
      text: 'OpenAI-compatible stream response',
    });
    assert.deepEqual(await collectText(googleModel), {
      error: undefined,
      text: 'Google stream response',
    });

    const textDecoderStream = globalThis.TextDecoderStream;
    Object.defineProperty(globalThis, 'TextDecoderStream', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      assert.equal(
        (await generateText({ model: openaiModel, prompt })).text,
        'OpenAI-compatible non-stream response',
      );
      assert.equal(
        (await generateText({ model: googleModel, prompt })).text,
        'Google non-stream response',
      );

      const failures: string[] = [];

      for (const [provider, model] of [
        ['OpenAI-compatible', openaiModel],
        ['Google', googleModel],
      ] as const) {
        const result = await collectText(model);

        if (
          APICallError.isInstance(result.error) &&
          result.error.message === 'Failed to process successful response' &&
          result.error.cause instanceof TypeError &&
          result.error.cause.message.includes(
            'TextDecoderStream is not a constructor',
          ) &&
          result.text === ''
        ) {
          failures.push(provider);
          continue;
        }

        assert.equal(result.error, undefined);
        assert.equal(
          result.text,
          provider === 'Google'
            ? 'Google stream response'
            : 'OpenAI-compatible stream response',
        );
      }

      if (failures.length > 0) {
        throw new Error(
          `ISSUE #13588: streamText failed to process successful SSE responses without TextDecoderStream (${failures.join(
            ', ',
          )})`,
        );
      }
    } finally {
      Object.defineProperty(globalThis, 'TextDecoderStream', {
        configurable: true,
        value: textDecoderStream,
        writable: true,
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error != null) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
