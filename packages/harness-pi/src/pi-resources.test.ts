import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  close,
  createFakePi,
  createScriptedModelServerThenDone,
  listen,
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

describe('Pi with a scripted model', () => {
  const model = createScriptedModelServerThenDone();
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

  it('lists configured skills in the system prompt', async () => {
    const sessionWorkDir = '/sandbox/work';
    const sandboxSession = await createJustBashSandbox({
      cwd: sessionWorkDir,
    }).createSession();
    const firstRequest = model.requests.length;
    const harness = createFakePi(modelUrl, {
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

    const systemPrompt = systemPromptOf(model.requests[firstRequest]);
    expect(systemPrompt).toContain('brand-voice');
    expect(systemPrompt).toContain('SKILL-TOKEN-17');
  });
});
