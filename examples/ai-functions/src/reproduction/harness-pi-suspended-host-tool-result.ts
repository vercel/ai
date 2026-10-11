import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { tool } from 'ai';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';

const syntheticResult = '{"error":"Pi session suspended"}';
const realResult = '{"answer":"A"}';
const failureSignal =
  'Issue #22931 reproduced: the continued model saw "Pi session suspended" instead of the submitted answer.';

type CapturedRequest = {
  messages?: Array<{ role?: string; content?: unknown }>;
};

async function readJson(request: IncomingMessage): Promise<CapturedRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as CapturedRequest;
}

function writeSse(response: ServerResponse, chunks: unknown[]): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end('data: [DONE]\n\n');
}

function containsText(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value.includes(expected);
  if (Array.isArray(value)) {
    return value.some(item => containsText(item, expected));
  }
  if (value != null && typeof value === 'object') {
    return Object.values(value).some(item => containsText(item, expected));
  }
  return false;
}

async function main(): Promise<void> {
  const capturedRequests: CapturedRequest[] = [];
  const server = createServer(async (request, response) => {
    try {
      const body = await readJson(request);
      capturedRequests.push(body);

      if (capturedRequests.length === 1) {
        writeSse(response, [
          {
            id: 'chatcmpl-tool-call',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'repro-model',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_ask_user',
                      type: 'function',
                      function: {
                        name: 'ask_user',
                        arguments: '{"question":"Choose A"}',
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: 'chatcmpl-tool-call',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'repro-model',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'tool_calls',
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          },
        ]);
        return;
      }

      const modelObservation = containsText(body.messages, realResult)
        ? 'MODEL_SAW_REAL_ANSWER'
        : containsText(body.messages, syntheticResult)
          ? 'MODEL_SAW_SYNTHETIC_SUSPEND_ERROR'
          : 'MODEL_SAW_NO_TOOL_RESULT';

      writeSse(response, [
        {
          id: 'chatcmpl-continuation',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'repro-model',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: modelObservation },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-continuation',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'repro-model',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        },
      ]);
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Expected the local model server to use a TCP port.');
  }

  const createAgent = () => {
    const harness = createPi({
      reattachInProcess: false,
      providers: {
        local: {
          api: 'openai-completions',
          apiKey: 'reproduction-key',
          authHeader: true,
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          models: [
            {
              id: 'repro-model',
              name: 'Reproduction Model',
              reasoning: false,
              input: ['text'],
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              contextWindow: 16_384,
              maxTokens: 1_024,
            },
          ],
        },
      },
    });
    return new HarnessAgent({
      harness,
      model: 'local/repro-model',
      tools: {
        ask_user: tool({
          description: 'Ask the user to choose an answer.',
          inputSchema: z.object({ question: z.string() }),
        }),
      },
    });
  };

  const firstAgent = createAgent();
  const sandboxSession = await createJustBashNetworkSandboxSession({
    template: await firstAgent.getSandboxTemplate(),
  });
  let session = await firstAgent.createSession({ sandboxSession });

  try {
    const firstTurn = await firstAgent.stream({
      session,
      prompt: 'Call ask_user exactly once and use its answer.',
    });
    const toolCall = (await firstTurn.toolCalls).find(
      call => call.toolName === 'ask_user',
    );
    if (toolCall == null) {
      throw new Error(
        'The local model did not produce the expected tool call.',
      );
    }

    const sessionId = session.sessionId;
    const continueFrom = await session.suspendTurn();

    const secondAgent = createAgent();
    session = await secondAgent.createSession({
      sandboxSession,
      sessionId,
      continueFrom,
    });
    const continued = await secondAgent.continueStream({
      session,
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: { type: 'json', value: { answer: 'A' } },
        },
      ],
    });
    const continuedText = await continued.text;

    if (continuedText !== 'MODEL_SAW_REAL_ANSWER') {
      throw new Error(failureSignal);
    }
  } finally {
    try {
      await session.destroy();
    } catch {
      // Preserve the primary reproduction failure.
    }
    try {
      await sandboxSession.destroy();
    } catch {
      // Preserve the primary reproduction failure.
    }
    server.close();
    await once(server, 'close');
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
