import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPi } from '../../../../packages/harness-pi/src/index';

const FAILURE_SIGNAL =
  'ISSUE_21398_REPRODUCED: reattachInProcess=false retained suspended resources';

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const textFiles = new Map<string, string>();
  const binaryFiles = new Map<string, Uint8Array>();

  const sandbox = {
    id: 'issue-21398-sandbox',
    defaultWorkingDirectory: '/sandbox',
    ports: [],
    destroy: async () => {},
    getPortEndpoint: () => undefined,
    getPortUrl: () => undefined,
    readBinaryFile: async ({ path: filePath }: { path: string }) =>
      binaryFiles.get(filePath),
    readTextFile: async ({ path: filePath }: { path: string }) =>
      textFiles.get(filePath),
    restricted: () => sandbox,
    run: async ({ command }: { command: string }) => {
      const manifestMove = command.match(/^mv -f '([^']+)' '([^']+)'$/);
      if (manifestMove != null) {
        const content = textFiles.get(manifestMove[1]!);
        if (content != null) {
          textFiles.set(manifestMove[2]!, content);
        }
      }
      return {
        stdout: command === 'printf "%s" "$HOME"' ? '/sandbox/home' : '',
        stderr: '',
        exitCode: 0,
      };
    },
    stop: async () => {},
    writeBinaryFile: async ({
      path: filePath,
      content,
    }: {
      path: string;
      content: Uint8Array;
    }) => {
      binaryFiles.set(filePath, content);
    },
    writeTextFile: async ({
      path: filePath,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      textFiles.set(filePath, content);
    },
  };

  return sandbox as unknown as HarnessV1NetworkSandboxSession;
}

function containsJournal(root: string): boolean {
  if (!existsSync(root)) return false;
  return readdirSync(root, { recursive: true }).some(entry =>
    String(entry).endsWith('.jsonl'),
  );
}

async function settlesSoon(promise: PromiseLike<unknown>): Promise<boolean> {
  return Promise.race([
    Promise.resolve(promise).then(
      () => true,
      () => true,
    ),
    new Promise<false>(resolve => setTimeout(() => resolve(false), 500)),
  ]);
}

async function main() {
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'close',
    });

    const chunks = [
      {
        id: 'chatcmpl-issue-21398',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'repro-model',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-issue-21398',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'repro-model',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'tool-issue-21398',
                  type: 'function',
                  function: { name: 'weather', arguments: '{}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-issue-21398',
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
      },
    ];

    for (const chunk of chunks) {
      response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    response.end('data: [DONE]\n\n');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Reproduction server did not bind to a TCP port.');
  }

  const harness = createPi({
    reattachInProcess: false,
    providers: {
      repro: {
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        apiKey: 'issue-21398-test-key',
        api: 'openai-completions',
        authHeader: true,
        models: [
          {
            id: 'repro-model',
            name: 'Reproduction model',
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 4096,
            maxTokens: 256,
          },
        ],
      },
    },
  });

  const failures: string[] = [];

  try {
    for (const lifecycle of ['suspend', 'detach'] as const) {
      const sessionId = `issue-21398-${lifecycle}-${process.pid}`;
      const hostRoot = path.join(tmpdir(), 'ai-sdk-harness', 'pi', sessionId);
      const session = await harness.doStart({
        sessionId,
        sandboxSession: createSandboxSession(),
        sessionWorkDir: '/sandbox/work',
      });

      let resolveToolCall!: () => void;
      const toolCall = new Promise<void>(resolve => {
        resolveToolCall = resolve;
      });

      const control = await session.doPromptTurn({
        model: 'repro/repro-model',
        skills: [],
        prompt: 'Call the weather tool.',
        tools: [{ name: 'weather' }],
        emit: part => {
          if (part.type === 'tool-call') {
            resolveToolCall();
          }
        },
      });

      try {
        await toolCall;
        // The translated tool-call event is emitted just before Pi invokes the
        // host tool. Let that invocation enter its pending-result wait.
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!existsSync(hostRoot) || !containsJournal(hostRoot)) {
          throw new Error(
            `Precondition failed: ${lifecycle} did not create a host journal.`,
          );
        }

        if (lifecycle === 'suspend') {
          await session.doSuspendTurn();
        } else {
          await session.doDetach();
        }

        const turnSettled = await settlesSoon(control.done);
        const hostRootRemoved = !existsSync(hostRoot);
        console.log(
          `${lifecycle}: hostRootRemoved=${hostRootRemoved} turnSettled=${turnSettled}`,
        );

        if (!hostRootRemoved || !turnSettled) {
          failures.push(
            `${lifecycle}(hostRootRemoved=${hostRootRemoved},turnSettled=${turnSettled})`,
          );
        }
      } finally {
        await session.doDestroy();
      }
    }
  } finally {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  }

  if (failures.length > 0) {
    throw new Error(`${FAILURE_SIGNAL}: ${failures.join(', ')}`);
  }

  console.log(
    'PASS: suspend and detach released the Pi runtime, pending turn, and hostRoot.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
