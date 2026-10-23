import { describe, expect, it } from 'vitest';
import { piLifecycleStateSchema } from './pi-lifecycle-state';
import {
  createFakePi,
  createThrowingSandboxSession,
  runPromptTurn,
  useScriptedPiModel,
  type ModelRequestBody,
} from './test-helpers';

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
  const scripted = useScriptedPiModel();
  const { model } = scripted;

  it('lists configured skills in the system prompt', async () => {
    const sessionWorkDir = '/sandbox/work';
    const sandboxSession = createThrowingSandboxSession();
    const firstRequest = model.requests.length;
    const harness = createFakePi(scripted.url, {
      resources: {
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

    const first = await createFakePi(scripted.url).doStart(sessionStart);
    await runPromptTurn(first, 'Remember the word PELICAN.');
    const state = await first.doStop();

    expect(piLifecycleStateSchema.parse(state.data).entries?.[0]).toMatchObject(
      { type: 'session', id: 'session-pelican' },
    );

    const firstRequest = model.requests.length;
    const resumed = await createFakePi(scripted.url).doStart({
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
    const session = await createFakePi(scripted.url).doStart({
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
