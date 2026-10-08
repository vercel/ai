import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPi } from './pi-harness';

type ModelRequestBody = {
  readonly messages: ReadonlyArray<{
    readonly role: string;
    readonly content: unknown;
  }>;
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const close = (server: Server): Promise<void> =>
  new Promise(resolve => server.close(() => resolve()));

const STOP_CHUNKS: ReadonlyArray<object> = [
  { choices: [{ index: 0, delta: { role: 'assistant', content: 'done' } }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
];

const createModelServer = () => {
  const requests: ModelRequestBody[] = [];
  const server = createServer(async (request, response) => {
    requests.push(JSON.parse(await readBody(request)));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const chunk of STOP_CHUNKS) {
      response.write(
        `data: ${JSON.stringify({ id: 'chatcmpl-test', model: 'fake-model', ...chunk })}\n\n`,
      );
    }
    response.end('data: [DONE]\n\n');
  });
  return { server, requests };
};

const systemPromptOf = (body: ModelRequestBody | undefined): string => {
  const system = body?.messages.find(
    message => message.role === 'system' || message.role === 'developer',
  );
  return typeof system?.content === 'string'
    ? system.content
    : JSON.stringify(system?.content);
};

describe('Pi project resources', () => {
  const model = createModelServer();
  const agentDir = mkdtempSync(path.join(tmpdir(), 'pi-resources-agent-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  let modelUrl = '';

  beforeAll(async () => {
    process.env.PI_CODING_AGENT_DIR = agentDir;
    modelUrl = await listen(model.server);
  });

  afterAll(async () => {
    if (previousAgentDir == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await close(model.server);
    rmSync(agentDir, { recursive: true, force: true });
  });

  it('places configured context files and skills in the system prompt', async () => {
    const sessionWorkDir = '/sandbox/work';
    const sandboxSession = await createJustBashSandbox({
      cwd: sessionWorkDir,
    }).createSession();
    const harness = createPi({
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
      resources: {
        contextFiles: [
          {
            path: '/sandbox/work/AGENTS.md',
            content: 'Project note: AGENTS-TOKEN-41',
          },
        ],
        skills: [
          {
            name: 'brand-voice',
            description: 'Voice rules SKILL-TOKEN-17',
            filePath: '/sandbox/skills/brand-voice/SKILL.md',
          },
        ],
      },
    });

    const session = await harness.doStart({
      sessionId: 'session-resources',
      sandboxSession,
      sessionWorkDir,
    });
    try {
      const control = await session.doPromptTurn({
        prompt: 'Hello.',
        model: 'fake/fake-model',
        tools: [],
        skills: [],
        emit: () => {},
      });
      await control.done;
    } finally {
      await session.doDestroy();
      await sandboxSession.destroy();
    }

    const systemPrompt = systemPromptOf(model.requests[0]);
    expect(systemPrompt).toContain(
      '<project_instructions path="/sandbox/work/AGENTS.md">\nProject note: AGENTS-TOKEN-41\n</project_instructions>',
    );
    expect(systemPrompt).toContain('brand-voice');
    expect(systemPrompt).toContain('SKILL-TOKEN-17');
  });
});
