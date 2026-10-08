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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPi, type PiHarnessSettings } from './pi-harness';
import { piLifecycleStateSchema } from './pi-lifecycle-state';

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

const untouchable = async (): Promise<never> => {
  throw new Error('sandbox must not be touched');
};

const createThrowingSandboxSession = (): HarnessV1NetworkSandboxSession => {
  const sandbox: HarnessV1NetworkSandboxSession = {
    id: 'sandbox',
    description: 'throwing sandbox',
    defaultWorkingDirectory: '/sandbox',
    ports: [],
    run: untouchable,
    spawn: untouchable,
    readFile: untouchable,
    readBinaryFile: untouchable,
    readTextFile: untouchable,
    writeFile: untouchable,
    writeBinaryFile: untouchable,
    writeTextFile: untouchable,
    stop: untouchable,
    destroy: untouchable,
    getPortEndpoint: untouchable,
    getPortUrl: untouchable,
    restricted: () => sandbox,
  };
  return sandbox;
};

const systemPromptOf = (body: ModelRequestBody | undefined): string => {
  const system = body?.messages.find(
    message => message.role === 'system' || message.role === 'developer',
  );
  return typeof system?.content === 'string'
    ? system.content
    : JSON.stringify(system?.content);
};

const requestText = (body: ModelRequestBody | undefined): string =>
  JSON.stringify(body?.messages);

describe('Pi with a scripted model', () => {
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

  const createFakePi = (settings: PiHarnessSettings = {}) =>
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

  const runPromptTurn = async (
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

  it('places configured context files and skills in the system prompt', async () => {
    const sessionWorkDir = '/sandbox/work';
    const sandboxSession = createThrowingSandboxSession();
    const firstRequest = model.requests.length;
    const harness = createFakePi({
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
      await runPromptTurn(session, 'Hello.');
    } finally {
      await session.doDestroy();
    }

    const systemPrompt = systemPromptOf(model.requests[firstRequest]);
    expect(systemPrompt).toContain(
      '<project_instructions path="/sandbox/work/AGENTS.md">\nProject note: AGENTS-TOKEN-41\n</project_instructions>',
    );
    expect(systemPrompt).toContain('brand-voice');
    expect(systemPrompt).toContain('SKILL-TOKEN-17');
  });

  it('resumes the conversation from lifecycle data without touching the sandbox', async () => {
    const sandboxSession = createThrowingSandboxSession();
    const sessionStart = {
      sessionId: 'session-pelican',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    };

    const first = await createFakePi().doStart(sessionStart);
    await runPromptTurn(first, 'Remember the word PELICAN.');
    const state = await first.doStop();

    expect(piLifecycleStateSchema.parse(state.data).entries?.[0]).toMatchObject(
      { type: 'session', id: 'session-pelican' },
    );

    const firstRequest = model.requests.length;
    const resumed = await createFakePi().doStart({
      ...sessionStart,
      resumeFrom: state,
    });
    try {
      await runPromptTurn(resumed, 'Which word did I ask you to remember?');
    } finally {
      await resumed.doDestroy();
    }

    const resumedRequest = model.requests[firstRequest];
    expect(requestText(resumedRequest)).toContain('Remember the word PELICAN.');
    expect(resumedRequest?.messages).toContainEqual({
      role: 'assistant',
      content: 'done',
    });
  });

  it('migrates entries recorded under an older session version', async () => {
    const usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const assistant = (id: string, parentId: string) => ({
      type: 'message',
      id,
      parentId,
      timestamp: '2026-01-03T10:00:02.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Acknowledged.' }],
        api: 'openai-completions',
        provider: 'fake',
        model: 'fake-model',
        usage,
        stopReason: 'stop',
        timestamp: 2,
      },
    });
    const entries = [
      {
        type: 'session',
        version: 2,
        id: 'session-heron',
        timestamp: '2026-01-03T10:00:00.000Z',
        cwd: '/sandbox/work',
      },
      {
        type: 'message',
        id: 'e1',
        parentId: null,
        timestamp: '2026-01-03T10:00:01.000Z',
        message: {
          role: 'user',
          content: 'I will share a project note next. Just acknowledge.',
          timestamp: 1,
        },
      },
      assistant('e2', 'e1'),
      {
        type: 'message',
        id: 'e3',
        parentId: 'e2',
        timestamp: '2026-01-03T10:00:03.000Z',
        message: {
          role: 'hookMessage',
          customType: 'brand-note',
          content: 'The codename is BLUE-HERON-7.',
          display: true,
          timestamp: 3,
        },
      },
      assistant('e4', 'e3'),
    ];

    const firstRequest = model.requests.length;
    const session = await createFakePi().doStart({
      sessionId: 'session-heron',
      sandboxSession: createThrowingSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'pi',
        specificationVersion: 'harness-v1',
        data: { entries },
      },
    });
    await runPromptTurn(session, 'What is the codename?');
    const state = await session.doStop();

    expect(requestText(model.requests[firstRequest])).toContain('BLUE-HERON-7');
    const savedEntries = piLifecycleStateSchema.parse(state.data).entries;
    expect(savedEntries?.[0]).toMatchObject({ type: 'session', version: 3 });
    expect(savedEntries?.find(entry => entry.id === 'e3')).toMatchObject({
      message: { role: 'custom', content: 'The codename is BLUE-HERON-7.' },
    });
  });
});
