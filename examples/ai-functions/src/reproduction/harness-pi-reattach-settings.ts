import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi as createParkedPi } from '@ai-sdk/harness-pi';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { tool } from 'ai';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { createPi as createColdPi } from '../../../../packages/harness-pi/src/index';

const PROVIDER_ID = 'issue-20766-provider';
const MODEL_ID = 'issue-20766-model';
const execFileAsync = promisify(execFile);

type RecordedRequest = {
  authorization: string | undefined;
  body: {
    messages?: Array<{ role?: string }>;
    tools?: unknown[];
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function createAgentDir({
  root,
  name,
  baseUrl,
  apiKey,
}: {
  root: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}) {
  const agentDir = path.join(root, name);
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, 'auth.json'),
    JSON.stringify({
      [PROVIDER_ID]: { type: 'api_key', key: apiKey },
    }),
  );
  await writeFile(
    path.join(agentDir, 'models.json'),
    JSON.stringify({
      providers: {
        [PROVIDER_ID]: {
          baseUrl,
          api: 'openai-completions',
          authHeader: true,
          models: [
            {
              id: MODEL_ID,
              name: 'Issue 20766 model',
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
    }),
  );
  await writeFile(path.join(agentDir, 'settings.json'), '{}');
  return agentDir;
}

function writeSse(response: ServerResponse, chunks: unknown[]) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    connection: 'keep-alive',
    'cache-control': 'no-cache',
  });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end('data: [DONE]\n\n');
}

async function createModelServer() {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const bodyChunks: Buffer[] = [];
    for await (const chunk of request) {
      bodyChunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(bodyChunks).toString());
    requests.push({
      authorization:
        typeof request.headers.authorization === 'string'
          ? request.headers.authorization
          : undefined,
      body,
    });
    const hasToolResult = body.messages?.some(
      (message: { role?: string }) => message.role === 'tool',
    );
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const shouldCallTool =
      hasTools &&
      !hasToolResult &&
      JSON.stringify(body.messages).includes('Call askUser exactly once');
    const id = `chatcmpl-${requests.length}`;
    const base = {
      id,
      object: 'chat.completion.chunk',
      created: 1,
      model: MODEL_ID,
    };

    if (shouldCallTool) {
      writeSse(response, [
        {
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: `call-${requests.length}`,
                    type: 'function',
                    function: { name: 'askUser', arguments: '{}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          ...base,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'tool_calls',
            },
          ],
        },
      ]);
      return;
    }

    writeSse(response, [
      {
        ...base,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Completed normally.' },
            finish_reason: null,
          },
        ],
      },
      {
        ...base,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      },
    ]);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(
    address != null && typeof address === 'object',
    'Expected TCP address.',
  );

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

const askUser = tool({
  description: 'Ask the user for an answer.',
  inputSchema: z.object({}),
});

function createLocalSandbox({
  homeDir,
  workingDirectory,
}: {
  homeDir: string;
  workingDirectory: string;
}): Experimental_SandboxSession {
  const readBytes = async (filePath: string) => {
    try {
      return new Uint8Array(await readFile(filePath));
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }
  };

  return {
    description: 'Local filesystem sandbox for issue #20766.',
    readFile: async ({ path: filePath }) => {
      const bytes = await readBytes(filePath);
      return bytes == null
        ? null
        : new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          });
    },
    readBinaryFile: async ({ path: filePath }) => readBytes(filePath),
    readTextFile: async ({ path: filePath, encoding = 'utf-8' }) => {
      const bytes = await readBytes(filePath);
      return bytes == null
        ? null
        : Buffer.from(bytes).toString(encoding as BufferEncoding);
    },
    writeFile: async ({ path: filePath, content }) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      const reader = content.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      await writeFile(filePath, Buffer.concat(chunks.map(Buffer.from)));
    },
    writeBinaryFile: async ({ path: filePath, content }) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    },
    writeTextFile: async ({ path: filePath, content, encoding = 'utf-8' }) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, {
        encoding: encoding as BufferEncoding,
      });
    },
    spawn: async () => {
      throw new Error('The reproduction does not spawn sandbox processes.');
    },
    run: async ({ command, workingDirectory: commandCwd, env }) => {
      try {
        const result = await execFileAsync('/bin/sh', ['-c', command], {
          cwd: commandCwd ?? workingDirectory,
          env: {
            ...process.env,
            HOME: homeDir,
            ...env,
          },
        });
        return {
          exitCode: 0,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'number'
        ) {
          return {
            exitCode: error.code,
            stdout:
              'stdout' in error && typeof error.stdout === 'string'
                ? error.stdout
                : '',
            stderr:
              'stderr' in error && typeof error.stderr === 'string'
                ? error.stderr
                : error.message,
          };
        }
        throw error;
      }
    },
  };
}

function createAgent({
  createPi,
  agentDir,
}: {
  createPi: typeof createParkedPi;
  agentDir: string;
}) {
  return new HarnessAgent({
    harness: createPi({ agentDir, auth: 'openai' }),
    model: `${PROVIDER_ID}/${MODEL_ID}`,
    tools: { askUser },
  });
}

async function suspendAtToolCall({
  agent,
  sandboxSession,
}: {
  agent: ReturnType<typeof createAgent>;
  sandboxSession: Experimental_SandboxSession;
}) {
  const session = await agent.createSession({ sandboxSession });
  const result = await agent.stream({
    session,
    prompt: 'Call askUser exactly once, then use its result.',
  });
  const toolCalls = await result.toolCalls;
  const toolCall = toolCalls.find(call => call.toolName === 'askUser');
  assert(toolCall != null, 'Expected askUser tool call.');
  assert(session.hasUnfinishedTurn(), 'Expected an unfinished tool turn.');
  const sessionId = session.sessionId;
  const continueFrom = await session.suspendTurn();
  return { sessionId, continueFrom, toolCall };
}

async function continueCold({
  agent,
  sandboxSession,
  sessionId,
  continueFrom,
  toolCallId,
}: {
  agent: ReturnType<typeof createAgent>;
  sandboxSession: Experimental_SandboxSession;
  sessionId: string;
  continueFrom: Awaited<
    ReturnType<
      Awaited<
        ReturnType<ReturnType<typeof createAgent>['createSession']>
      >['suspendTurn']
    >
  >;
  toolCallId: string;
}) {
  const session = await agent.createSession({
    sessionId,
    continueFrom,
    sandboxSession,
  });
  const result = await agent.continueGenerate({
    session,
    toolResultContinuations: [
      {
        type: 'tool-result',
        toolCallId,
        toolName: 'askUser',
        output: { type: 'text', value: 'answer' },
      },
    ],
  });
  assert(
    result.text === 'Completed normally.',
    `Expected cold continuation to complete, received ${JSON.stringify(result.text)}.`,
  );
  return session;
}

async function captureError(action: () => Promise<unknown>) {
  try {
    await action();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function captureOutcome<T>(action: () => Promise<T>) {
  try {
    return { value: await action(), error: undefined };
  } catch (error) {
    return {
      value: undefined,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function withTemporaryTmpDir<T>(
  temporaryDirectory: string,
  action: () => Promise<T>,
): Promise<T> {
  await mkdir(temporaryDirectory, { recursive: true });
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = temporaryDirectory;
  try {
    return await action();
  } finally {
    if (previous == null) {
      delete process.env.TMPDIR;
    } else {
      process.env.TMPDIR = previous;
    }
  }
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), 'issue-20766-'));
  const modelServer = await createModelServer();
  const sandboxHome = path.join(root, 'sandbox-home');
  const sandboxWork = path.join(root, 'sandbox-work');
  await mkdir(sandboxHome, { recursive: true });
  await mkdir(sandboxWork, { recursive: true });
  const sandboxSession = createLocalSandbox({
    homeDir: sandboxHome,
    workingDirectory: sandboxWork,
  });

  let settingsError: Error | undefined;
  let staleStateError: Error | undefined;

  try {
    const firstDir = await createAgentDir({
      root,
      name: 'settings-request-1',
      baseUrl: modelServer.baseUrl,
      apiKey: 'request-1-key',
    });
    const secondDir = await createAgentDir({
      root,
      name: 'settings-request-2',
      baseUrl: modelServer.baseUrl,
      apiKey: 'request-2-key',
    });

    const request1 = createAgent({
      createPi: createParkedPi,
      agentDir: firstDir,
    });
    const suspended = await suspendAtToolCall({
      agent: request1,
      sandboxSession,
    });

    await rm(firstDir, { recursive: true, force: true });
    const sameProcessRequest2 = createAgent({
      createPi: createParkedPi,
      agentDir: secondDir,
    });
    const sameProcessSession = await sameProcessRequest2.createSession({
      sessionId: suspended.sessionId,
      continueFrom: suspended.continueFrom,
      sandboxSession,
    });
    const settingsOutcome = await captureOutcome(() =>
      sameProcessRequest2.continueGenerate({
        session: sameProcessSession,
        toolResultContinuations: [
          {
            type: 'tool-result',
            toolCallId: suspended.toolCall.toolCallId,
            toolName: 'askUser',
            output: { type: 'text', value: 'answer' },
          },
        ],
      }),
    );
    settingsError = settingsOutcome.error;
    if (settingsOutcome.value != null) {
      assert(
        settingsOutcome.value.text === 'Completed normally.',
        `Expected same-process continuation to complete, received ${JSON.stringify(settingsOutcome.value.text)}.`,
      );
    }
    await sameProcessSession.destroy();

    if (settingsError != null) {
      const coldRequest2 = createAgent({
        createPi: createColdPi,
        agentDir: secondDir,
      });
      const coldSession = await withTemporaryTmpDir(
        path.join(root, 'settings-process-b-tmp'),
        () =>
          continueCold({
            agent: coldRequest2,
            sandboxSession,
            sessionId: suspended.sessionId,
            continueFrom: suspended.continueFrom,
            toolCallId: suspended.toolCall.toolCallId,
          }),
      );
      await coldSession.stop();
      assert(
        modelServer.requests.some(
          request => request.authorization === 'Bearer request-2-key',
        ),
        'Expected the cold continuation to use request 2 credentials.',
      );
    }

    const staleDirA = await createAgentDir({
      root,
      name: 'stale-request-a',
      baseUrl: modelServer.baseUrl,
      apiKey: 'stale-a-key',
    });
    const staleDirB = await createAgentDir({
      root,
      name: 'stale-request-b',
      baseUrl: modelServer.baseUrl,
      apiKey: 'stale-b-key',
    });
    const staleDirC = await createAgentDir({
      root,
      name: 'stale-request-c',
      baseUrl: modelServer.baseUrl,
      apiKey: 'stale-c-key',
    });

    const processARequest1 = createAgent({
      createPi: createParkedPi,
      agentDir: staleDirA,
    });
    const staleSuspended = await suspendAtToolCall({
      agent: processARequest1,
      sandboxSession,
    });

    const processBRequest2 = createAgent({
      createPi: createColdPi,
      agentDir: staleDirB,
    });
    const completedOnB = await withTemporaryTmpDir(
      path.join(root, 'stale-process-b-tmp'),
      () =>
        continueCold({
          agent: processBRequest2,
          sandboxSession,
          sessionId: staleSuspended.sessionId,
          continueFrom: staleSuspended.continueFrom,
          toolCallId: staleSuspended.toolCall.toolCallId,
        }),
    );
    const resumeFrom = await completedOnB.stop();

    const processARequest3 = createAgent({
      createPi: createParkedPi,
      agentDir: staleDirC,
    });
    const staleSession = await processARequest3.createSession({
      sessionId: staleSuspended.sessionId,
      resumeFrom,
      sandboxSession,
    });
    staleStateError = await captureError(async () => {
      await processARequest3.generate({
        session: staleSession,
        prompt: 'Start a new turn and answer normally.',
      });
    });
    await staleSession.destroy();

    const settingsMessage = settingsError?.message ?? '';
    const staleMessage = staleStateError?.message ?? '';
    assert(
      settingsMessage.includes(`Provider is not configured: ${PROVIDER_ID}`),
      `Expected same-process continuation to fail with stale credentials, received ${JSON.stringify(settingsMessage)}.`,
    );
    assert(
      staleMessage.includes('Agent is already processing'),
      `Expected stale parked session to reject a new turn, received ${JSON.stringify(staleMessage)}.`,
    );

    throw new Error(
      `ISSUE 20766 REPRODUCED: same-process reattach ignored request 2 credentials (${settingsMessage}); stale parked session ignored completed lifecycle state (${staleMessage})`,
    );
  } finally {
    await modelServer.close();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
