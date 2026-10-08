import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import {
  createLazyNetworkSandboxSession,
  HarnessAgent,
} from '@ai-sdk/harness/agent';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  close,
  createFakePi,
  createScriptedModelServerThenDone,
  listen,
} from './test-helpers';

const toolCallChunks = (name: string, args: object): object[] => [
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

const createRecordingSandboxSession = () => {
  const run = vi.fn(async ({ command }: { command: string }) => ({
    stdout: command === 'printf "%s" "$HOME"' ? '/sandbox/home' : '',
    stderr: '',
    exitCode: 0,
  }));
  const sandbox = {
    id: 'sandbox-lazy',
    description: 'recording sandbox',
    defaultWorkingDirectory: '/sandbox',
    ports: [],
    run,
    readTextFile: vi.fn(async () => null),
    readBinaryFile: vi.fn(async () => null),
    writeTextFile: vi.fn(async () => {}),
    writeBinaryFile: vi.fn(async () => {}),
    getPortEndpoint: vi.fn(),
    getPortUrl: vi.fn(),
    stop: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    restricted: () => sandbox,
  };
  return { sandbox: sandbox as unknown as HarnessV1NetworkSandboxSession, run };
};

describe('Pi with a lazy sandbox', () => {
  const model = createScriptedModelServerThenDone();
  const agentDir = mkdtempSync(path.join(tmpdir(), 'pi-lazy-sandbox-agent-'));
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

  it('a chat-only turn with lazy setup and a lazy sandbox session acquires no sandbox', async () => {
    const acquire = vi.fn(async () => createRecordingSandboxSession().sandbox);
    const agent = new HarnessAgent({
      harness: createFakePi(modelUrl),
      model: 'fake/fake-model',
      sandboxConfig: { setup: 'lazy' },
    });

    const session = await agent.createSession({
      sandboxSession: createLazyNetworkSandboxSession({
        defaultWorkingDirectory: '/sandbox',
        acquire,
      }),
    });
    const result = await agent.generate({ session, prompt: 'Hello.' });
    const resumeState = await session.stop();
    await session.destroy();

    expect(result.text).toBe('done');
    expect(resumeState).toMatchObject({ type: 'resume-session' });
    expect(acquire).not.toHaveBeenCalled();
  });

  it('a turn that runs the bash tool acquires the sandbox once and creates the work directory before the command', async () => {
    const recording = createRecordingSandboxSession();
    const acquire = vi.fn(async () => recording.sandbox);
    model.enqueue(toolCallChunks('bash', { command: 'echo LAZY-TOKEN' }));
    const agent = new HarnessAgent({
      harness: createFakePi(modelUrl),
      model: 'fake/fake-model',
      sandboxConfig: { setup: 'lazy' },
    });

    const session = await agent.createSession({
      sessionId: 'lazy-bash',
      sandboxSession: createLazyNetworkSandboxSession({
        defaultWorkingDirectory: '/sandbox',
        acquire,
      }),
    });
    const result = await agent
      .generate({ session, prompt: 'Run the command.' })
      .finally(() => session.destroy());

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(recording.run.mock.calls[0]?.[0]).toMatchObject({
      command: 'mkdir -p "$WORK_DIR"',
      env: { WORK_DIR: '/sandbox/pi-lazy-bash' },
    });
    expect(
      recording.run.mock.calls
        .slice(1)
        .some(([{ command }]) => command.includes('echo LAZY-TOKEN')),
    ).toBe(true);
    expect(
      result.content.filter(part => part.type === 'tool-call'),
    ).toContainEqual(expect.objectContaining({ toolName: 'bash' }));
  });
});
