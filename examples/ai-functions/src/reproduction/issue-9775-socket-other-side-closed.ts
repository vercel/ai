import {
  createServer,
  type RequestListener,
  type ServerResponse,
} from 'node:http';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGateway } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';

const largeToolInput = 'x'.repeat(128 * 1024);

type ErrorLike = {
  cause?: unknown;
  code?: unknown;
  isRetryable?: unknown;
  message?: unknown;
  name?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asErrorLike(value: unknown): ErrorLike | undefined {
  return typeof value === 'object' && value != null
    ? (value as ErrorLike)
    : undefined;
}

function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current = asErrorLike(error);

  for (let index = 0; current != null && index < 10; index++) {
    chain.push(current);
    current = asErrorLike(current.cause);
  }

  return chain;
}

function hasErrorMessage(error: unknown, message: string): boolean {
  return errorChain(error).some(item => item.message === message);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return errorChain(error).some(item => item.code === code);
}

function errorName(error: unknown): string | undefined {
  const name = asErrorLike(error)?.name;
  return typeof name === 'string' ? name : undefined;
}

function errorMessage(error: unknown): string | undefined {
  const message = asErrorLike(error)?.message;
  return typeof message === 'string' ? message : undefined;
}

function assertUndiciSocketClosure(error: unknown) {
  assert(
    hasErrorMessage(error, 'terminated'),
    `Expected a TypeError with message "terminated", received ${String(error)}`,
  );
  assert(
    hasErrorMessage(error, 'other side closed'),
    'Expected an Undici SocketError with message "other side closed"',
  );
  assert(
    hasErrorCode(error, 'UND_ERR_SOCKET'),
    'Expected the Undici error code UND_ERR_SOCKET',
  );
}

function assertSerializable(error: unknown) {
  try {
    JSON.stringify(error);
  } catch {
    throw new Error(
      'The captured socket error unexpectedly had a circular JSON structure',
    );
  }
}

async function startServer(handler: RequestListener): Promise<{
  baseURL: string;
  close: () => Promise<void>;
}> {
  const server = createServer(handler);

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert(address != null && typeof address !== 'string', 'Server did not bind');

  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error == null) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
    },
  };
}

function writeSse(response: ServerResponse, value: unknown) {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function destroyAfterWrite(response: ServerResponse, value: string) {
  response.write(value, () => {
    setTimeout(() => response.socket?.destroy(), 10);
  });
}

function writeJson(response: ServerResponse, value: unknown) {
  const body = JSON.stringify(value);
  response.writeHead(200, {
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json',
  });
  response.end(body);
}

function openAIChatChunk(delta: unknown, finishReason: string | null = null) {
  return {
    id: 'chatcmpl-issue-9775',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        delta,
        logprobs: null,
        finish_reason: finishReason,
      },
    ],
  };
}

async function reproduceOpenAIStreamingFailure() {
  let attempts = 0;

  const server = await startServer((request, response) => {
    attempts++;
    request.resume();
    request.on('end', () => {
      response.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream',
      });

      writeSse(
        response,
        openAIChatChunk({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              index: 0,
              id: 'call_write_file',
              type: 'function',
              function: { name: 'write_file', arguments: '' },
            },
          ],
        }),
      );

      const toolInput =
        attempts === 1
          ? `{"path":"research.txt","content":"${largeToolInput}`
          : '{"path":"research.txt","content":"complete"}';

      writeSse(
        response,
        openAIChatChunk({
          tool_calls: [
            {
              index: 0,
              function: { arguments: toolInput },
            },
          ],
        }),
      );

      if (attempts === 1) {
        destroyAfterWrite(response, '');
        return;
      }

      writeSse(response, openAIChatChunk({}, 'tool_calls'));
      writeSse(response, {
        ...openAIChatChunk({}),
        choices: [],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      });
      response.end('data: [DONE]\n\n');
    });
  });

  let observedError: unknown;
  let toolInputDeltaBytes = 0;

  try {
    const result = streamText({
      model: createOpenAI({
        apiKey: 'test',
        baseURL: `${server.baseURL}/v1`,
      }).chat('gpt-4o'),
      prompt: 'Write a large research.txt file.',
      maxRetries: 1,
      tools: {
        write_file: tool({
          inputSchema: z.object({
            path: z.string(),
            content: z.string(),
          }),
          execute: async () => ({ ok: true }),
        }),
      },
    });

    try {
      for await (const part of result.fullStream) {
        if (part.type === 'tool-input-delta') {
          toolInputDeltaBytes += part.delta.length;
        } else if (part.type === 'error') {
          observedError = part.error;
        }
      }
    } catch (error) {
      observedError = error;
    }
  } finally {
    await server.close();
  }

  assertUndiciSocketClosure(observedError);
  assertSerializable(observedError);
  assert(
    toolInputDeltaBytes >= largeToolInput.length,
    'The OpenAI stream closed before the large write_file input was received',
  );
  assert(
    attempts === 1,
    `Expected no retry after the interrupted OpenAI tool stream, received ${attempts} requests`,
  );
}

async function reproduceAnthropicStreamingFailure() {
  let attempts = 0;

  const server = await startServer((request, response) => {
    attempts++;
    request.resume();
    request.on('end', () => {
      response.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream',
      });

      writeSse(response, {
        type: 'message_start',
        message: {
          id: 'msg_issue_9775',
          type: 'message',
          role: 'assistant',
          model: 'claude-test',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [],
          stop_reason: null,
        },
      });
      writeSse(response, {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'toolu_write_file',
          name: 'write_file',
          input: {},
        },
      });

      const toolInput =
        attempts === 1
          ? `{"path":"research.txt","content":"${largeToolInput}`
          : '{"path":"research.txt","content":"complete"}';

      writeSse(response, {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: toolInput,
        },
      });

      if (attempts === 1) {
        destroyAfterWrite(response, '');
        return;
      }

      writeSse(response, { type: 'content_block_stop', index: 0 });
      writeSse(response, {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 2 },
      });
      writeSse(response, { type: 'message_stop' });
      response.end();
    });
  });

  let observedError: unknown;
  let toolInputDeltaBytes = 0;

  try {
    const result = streamText({
      model: createAnthropic({
        apiKey: 'test',
        baseURL: `${server.baseURL}/v1`,
      })('claude-test'),
      prompt: 'Write a large research.txt file.',
      maxRetries: 1,
      tools: {
        write_file: tool({
          inputSchema: z.object({
            path: z.string(),
            content: z.string(),
          }),
          execute: async () => ({ ok: true }),
        }),
      },
    });

    try {
      for await (const part of result.fullStream) {
        if (part.type === 'tool-input-delta') {
          toolInputDeltaBytes += part.delta.length;
        } else if (part.type === 'error') {
          observedError = part.error;
        }
      }
    } catch (error) {
      observedError = error;
    }
  } finally {
    await server.close();
  }

  assertUndiciSocketClosure(observedError);
  assertSerializable(observedError);
  assert(
    toolInputDeltaBytes >= largeToolInput.length,
    'The Anthropic stream closed before the large write_file input was received',
  );
  assert(
    attempts === 1,
    `Expected no retry after the interrupted Anthropic tool stream, received ${attempts} requests`,
  );
}

async function reproduceOpenAIGenerateFailure() {
  let attempts = 0;

  const server = await startServer((request, response) => {
    attempts++;
    request.resume();
    request.on('end', () => {
      if (attempts === 1) {
        response.writeHead(200, {
          'content-length': 1024,
          'content-type': 'application/json',
        });
        destroyAfterWrite(
          response,
          '{"id":"partial","object":"chat.completion","choices":[',
        );
        return;
      }

      writeJson(response, {
        id: 'chatcmpl-retry-success',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'retry succeeded' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      });
    });
  });

  let observedError: unknown;

  try {
    try {
      await generateText({
        model: createOpenAI({
          apiKey: 'test',
          baseURL: `${server.baseURL}/v1`,
        }).chat('gpt-4o'),
        prompt: 'Write a large file.',
        maxRetries: 1,
      });
    } catch (error) {
      observedError = error;
    }
  } finally {
    await server.close();
  }

  assert(
    errorName(observedError) === 'AI_APICallError',
    `Expected AI_APICallError, received ${errorName(observedError)}`,
  );
  assert(
    errorMessage(observedError) === 'Failed to process successful response',
    `Unexpected OpenAI generateText error: ${errorMessage(observedError)}`,
  );
  assertUndiciSocketClosure(observedError);
  assertSerializable(observedError);
  assert(
    asErrorLike(observedError)?.isRetryable === false,
    'Expected the interrupted HTTP 200 response to be marked non-retryable',
  );
  assert(
    attempts === 1,
    `Expected maxRetries: 1 to retry the transient OpenAI failure, but observed ${attempts} requests`,
  );
}

async function reproduceGatewayGenerateFailure() {
  let attempts = 0;

  const server = await startServer((request, response) => {
    attempts++;
    request.resume();
    request.on('end', () => {
      if (attempts === 1) {
        response.writeHead(200, {
          'content-length': 1024,
          'content-type': 'application/json',
        });
        destroyAfterWrite(response, '{"content":[');
        return;
      }

      writeJson(response, {
        content: [{ type: 'text', text: 'retry succeeded' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
          raw: {},
        },
        response: {
          id: 'gateway-retry-success',
          timestamp: new Date(0).toISOString(),
          modelId: 'google/gemini-3-flash',
        },
      });
    });
  });

  let observedError: unknown;

  try {
    try {
      await generateText({
        model: createGateway({
          apiKey: 'test',
          baseURL: server.baseURL,
        })('google/gemini-3-flash'),
        prompt: 'Write a large file.',
        maxRetries: 1,
      });
    } catch (error) {
      observedError = error;
    }
  } finally {
    await server.close();
  }

  assert(
    errorName(observedError) === 'GatewayResponseError',
    `Expected GatewayResponseError, received ${errorName(observedError)}`,
  );
  assert(
    errorMessage(observedError) ===
      'Invalid error response format: Gateway request failed',
    `Unexpected Gateway error: ${errorMessage(observedError)}`,
  );
  assertUndiciSocketClosure(observedError);
  assertSerializable(observedError);
  assert(
    asErrorLike(observedError)?.isRetryable === false,
    'Expected the Gateway socket failure to be marked non-retryable',
  );
  assert(
    attempts === 1,
    `Expected maxRetries: 1 to retry the transient Gateway failure, but observed ${attempts} requests`,
  );
}

async function main() {
  await reproduceOpenAIStreamingFailure();
  await reproduceAnthropicStreamingFailure();
  await reproduceOpenAIGenerateFailure();
  await reproduceGatewayGenerateFailure();

  console.error(
    'ISSUE_9775_REPRODUCED: long OpenAI and Anthropic tool streams terminate with UND_ERR_SOCKET, while OpenAI and Gateway generateText do not retry the transient closure',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error('ISSUE_9775_REPRODUCTION_FAILED:', error);
  process.exitCode = 2;
});
