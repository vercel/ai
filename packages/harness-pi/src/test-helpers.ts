import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';
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

export const createScriptedModelServer = () => {
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
      stop: untouchable(),
      destroy: untouchable(),
      getPortEndpoint: untouchable(),
      getPortUrl: untouchable(),
      restricted: () => sandbox,
    };
    return sandbox;
  };
