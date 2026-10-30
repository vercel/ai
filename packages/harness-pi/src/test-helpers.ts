import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, vi } from 'vitest';
import { createPi, type PiHarnessSettings } from './pi-harness';

export type ModelRequestBody = {
  readonly messages: ReadonlyArray<{
    readonly role: string;
    readonly content: unknown;
  }>;
  readonly tools?: ReadonlyArray<{
    readonly function: { readonly name: string };
  }>;
};

type ModelResponseChunks = ReadonlyArray<object>;

const STOP_CHUNKS: ModelResponseChunks = [
  { choices: [{ index: 0, delta: { role: 'assistant', content: 'done' } }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
];

export const toolCallChunks = (name: string, args: object): object[] => [
  {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `call-${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  },
  { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
];

export const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

export const listen = async (server: Server): Promise<string> => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

export const close = (server: Server): Promise<void> =>
  new Promise(resolve => server.close(() => resolve()));

export const createScriptedModelServerThenDone = () => {
  const requests: ModelRequestBody[] = [];
  const queuedResponses: ModelResponseChunks[] = [];
  const server = createServer(async (request, response) => {
    requests.push(JSON.parse(await readBody(request)));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const chunk of queuedResponses.shift() ?? STOP_CHUNKS) {
      response.write(
        `data: ${JSON.stringify({ id: 'chatcmpl-test', model: 'fake-model', ...chunk })}\n\n`,
      );
    }
    response.end('data: [DONE]\n\n');
  });
  const enqueue = (...responses: ModelResponseChunks[]) => {
    queuedResponses.push(...responses);
  };
  return { server, requests, enqueue };
};

export const useScriptedPiModel = () => {
  const model = createScriptedModelServerThenDone();
  const agentDir = mkdtempSync(path.join(tmpdir(), 'pi-test-agent-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const state = { model, agentDir, url: '' };

  beforeAll(async () => {
    process.env.PI_CODING_AGENT_DIR = agentDir;
    state.url = await listen(model.server);
  });

  afterAll(async () => {
    if (previousAgentDir == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await close(model.server);
    rmSync(agentDir, { recursive: true, force: true });
  });

  return state;
};

export const runPromptTurn = async (
  session: HarnessV1Session,
  prompt: string,
): Promise<void> => {
  const parts: HarnessV1StreamPart[] = [];
  const control = await session.doPromptTurn({
    prompt,
    model: 'fake/fake-model',
    tools: [],
    skills: [],
    emit: part => parts.push(part),
  });
  await control.done;
  expect(parts.filter(part => part.type === 'error')).toEqual([]);
};

export const createFakePi = (
  modelUrl: string,
  settings: PiHarnessSettings = {},
) =>
  createPi({
    auth: {},
    providers: {
      fake: {
        baseUrl: `${modelUrl}/v1`,
        api: 'openai-completions',
        apiKey: 'test-key',
        models: [
          {
            id: 'fake-model',
            name: 'Fake Model',
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128_000,
            maxTokens: 4_096,
          },
        ],
      },
    },
    ...settings,
  });

const untouchable = () =>
  vi.fn(async (): Promise<never> => {
    throw new Error('sandbox must not be touched');
  });

export const createThrowingSandboxSession =
  (): HarnessV1NetworkSandboxSession => {
    const sandbox: HarnessV1NetworkSandboxSession = {
      id: 'sandbox',
      description: 'throwing sandbox',
      defaultWorkingDirectory: '/sandbox',
      ports: [],
      run: untouchable(),
      spawn: untouchable(),
      readFile: untouchable(),
      readBinaryFile: untouchable(),
      readTextFile: untouchable(),
      writeFile: untouchable(),
      writeBinaryFile: untouchable(),
      writeTextFile: untouchable(),
      stat: untouchable(),
      listDirectory: untouchable(),
      deleteFile: untouchable(),
      stop: untouchable(),
      destroy: untouchable(),
      getPortEndpoint: untouchable(),
      getPortUrl: untouchable(),
      restricted: () => sandbox,
    };
    return sandbox;
  };
