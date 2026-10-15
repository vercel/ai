import type { HarnessV1Session, HarnessV1StreamPart } from '@ai-sdk/harness';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  close,
  createFakePi,
  createScriptedModelServerThenDone,
  createThrowingSandboxSession,
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

  it('lists configured skills in the system prompt', async () => {
    const sessionWorkDir = '/sandbox/work';
    const sandboxSession = createThrowingSandboxSession();
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
      await runPromptTurn(session, 'Hello.');
    } finally {
      await session.doDestroy();
    }

    const systemPrompt = systemPromptOf(model.requests[firstRequest]);
    expect(systemPrompt).toContain('brand-voice');
    expect(systemPrompt).toContain('SKILL-TOKEN-17');
  });
});
