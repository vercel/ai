import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, it } from 'vitest';
import { piResumeStateSchema } from './pi-resume-state';
import {
  createFakePi,
  createEmptyRepositorySandboxSession,
  runPromptTurn,
  toolCallChunks,
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
    const sandboxSession = createEmptyRepositorySandboxSession();
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

  it('loads and refreshes repository instructions and skill listings in native Pi', async () => {
    const sessionWorkDir = '/sandbox/work';
    const sandboxSession = await createJustBashNetworkSandboxSession({
      cwd: sessionWorkDir,
    });
    const agentsPath = `${sessionWorkDir}/AGENTS.md`;
    const skillPath = `${sessionWorkDir}/.agents/skills/get-stock-price/SKILL.md`;
    await sandboxSession.writeTextFile({
      path: agentsPath,
      content: 'Always respond in French. REPOSITORY-FRENCH-17',
    });
    await sandboxSession.writeTextFile({
      path: skillPath,
      content: '---\ndescription: STOCK-SKILL-17\n---\nGOOG: 123.45 USD',
    });
    await sandboxSession.writeTextFile({
      path: `${sessionWorkDir}/.pi/settings.json`,
      content: '{"appendSystemPrompt":"REPOSITORY-CONFIG-MUST-NOT-LOAD"}',
    });
    const firstRequest = model.requests.length;
    const session = await createFakePi(scripted.url).doStart({
      sessionId: 'session-native-repository-resources',
      sandboxSession,
      sessionWorkDir,
    });

    try {
      await runPromptTurn(session, 'Look up a stock price.');
      const systemPrompt = systemPromptOf(model.requests[firstRequest]);
      expect(systemPrompt).toContain('REPOSITORY-FRENCH-17');
      expect(systemPrompt).toContain('STOCK-SKILL-17');
      expect(systemPrompt).toContain(skillPath);
      expect(systemPrompt).not.toContain('REPOSITORY-CONFIG-MUST-NOT-LOAD');

      await sandboxSession.writeTextFile({
        path: agentsPath,
        content: 'Always respond in German. REPOSITORY-GERMAN-29',
      });
      await sandboxSession.writeTextFile({
        path: skillPath,
        content:
          '---\ndescription: UPDATED-STOCK-SKILL-29\n---\nGOOG: 234.56 USD',
      });
      await runPromptTurn(session, 'Look up the price again.');
      const updatedRequest = requestText(model.requests[firstRequest + 1]);
      expect(updatedRequest).toContain('REPOSITORY-GERMAN-29');
      expect(updatedRequest).toContain('UPDATED-STOCK-SKILL-29');
      expect(updatedRequest).not.toContain('REPOSITORY-CONFIG-MUST-NOT-LOAD');
    } finally {
      await session.doDestroy();
      await sandboxSession.destroy();
    }
  });

  it('reads a repository skill but waits for approval before writing under allow-reads', async () => {
    const sessionWorkDir = '/sandbox/work';
    const sandboxSession = await createJustBashNetworkSandboxSession({
      cwd: sessionWorkDir,
    });
    const skillPath = `${sessionWorkDir}/.agents/skills/get-stock-price/SKILL.md`;
    await sandboxSession.writeTextFile({
      path: skillPath,
      content: '---\ndescription: Look up a stock price\n---\nGOOG: 123.45 USD',
    });
    model.enqueue(
      toolCallChunks('read', { file_path: skillPath }),
      toolCallChunks('write', {
        file_path: 'goog-price.md',
        content: 'GOOG: 123.45 USD',
      }),
    );
    const session = await createFakePi(scripted.url).doStart({
      sessionId: 'session-repository-skill-write-approval',
      sandboxSession,
      sessionWorkDir,
      permissionMode: 'allow-reads',
    });
    const parts: HarnessV1StreamPart[] = [];
    type Approval = Extract<
      HarnessV1StreamPart,
      { type: 'tool-approval-request' }
    >;
    let resolveApproval!: (approval: Approval) => void;
    const approvalRequested = new Promise<Approval>(resolve => {
      resolveApproval = resolve;
    });

    try {
      const control = await session.doPromptTurn({
        prompt: 'Use the stock-price skill and write the result.',
        model: 'fake/fake-model',
        tools: [],
        skills: [],
        emit: part => {
          parts.push(part);
          if (part.type === 'tool-approval-request') resolveApproval(part);
        },
      });
      const approval = await Promise.race([
        approvalRequested,
        control.done.then(() => {
          throw new Error('Expected a write approval request');
        }),
      ]);
      expect(
        await sandboxSession.readTextFile({
          path: `${sessionWorkDir}/goog-price.md`,
        }),
      ).toBeNull();
      expect(
        parts.filter(part => part.type === 'tool-approval-request'),
      ).toHaveLength(1);
      expect(parts).toContainEqual(
        expect.objectContaining({
          type: 'tool-call',
          toolName: 'write',
          toolCallId: approval.toolCallId,
        }),
      );
      expect(parts).toContainEqual(
        expect.objectContaining({
          type: 'tool-result',
          toolName: 'read',
          result: expect.objectContaining({
            structuredContent: expect.stringContaining('GOOG: 123.45 USD'),
          }),
        }),
      );

      await control.submitToolApproval!({
        approvalId: approval.approvalId,
        approved: true,
      });
      await control.done;
      expect(
        await sandboxSession.readTextFile({
          path: `${sessionWorkDir}/goog-price.md`,
        }),
      ).toBe('GOOG: 123.45 USD');
      expect(parts.filter(part => part.type === 'error')).toEqual([]);
    } finally {
      await session.doDestroy();
      await sandboxSession.destroy();
    }
  });

  it('resumes the conversation from lifecycle data only reading repository resources', async () => {
    const sandboxSession = createEmptyRepositorySandboxSession();
    const sessionStart = {
      sessionId: 'session-pelican',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    };

    const first = await createFakePi(scripted.url).doStart(sessionStart);
    await runPromptTurn(first, 'Remember the word PELICAN.');
    const state = await first.doStop();

    expect(piResumeStateSchema.parse(state.data).entries?.[0]).toMatchObject({
      type: 'session',
      id: 'session-pelican',
    });

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
      sandboxSession: createEmptyRepositorySandboxSession(),
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
    const savedEntries = piResumeStateSchema.parse(state.data).entries;
    expect(savedEntries?.[0]).toMatchObject({ type: 'session', version: 3 });
    expect(savedEntries?.find(entry => entry.id === 'e3')).toMatchObject({
      message: { role: 'custom', content: 'The codename is BLUE-HERON-7.' },
    });
  });
});
