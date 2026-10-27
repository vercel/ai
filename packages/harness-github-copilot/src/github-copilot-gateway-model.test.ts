import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { describe, expect, it, vi } from 'vitest';
import { withGitHubCopilotGatewayModel } from './github-copilot-gateway-model';

function createFakeHarness({
  parts,
}: {
  parts: ReadonlyArray<HarnessV1StreamPart>;
}) {
  const control = {
    done: Promise.resolve(),
  } as unknown as HarnessV1PromptControl;
  const runTurn = async (options: {
    emit: (part: HarnessV1StreamPart) => void;
  }) => {
    for (const part of parts) options.emit(part);
    return control;
  };
  const session = {
    sessionId: 'session-1',
    isResume: false,
    doPromptTurn: vi.fn(runTurn),
    doContinueTurn: vi.fn(runTurn),
  } as unknown as HarnessV1Session;
  const harness = {
    specificationVersion: 'harness-v1',
    harnessId: 'github-copilot',
    builtinTools: {},
    doStart: vi.fn(async () => session),
  } as unknown as HarnessV1;
  return { harness, session };
}

async function collectPromptTurnParts({
  parts,
  turn = 'prompt',
}: {
  parts: ReadonlyArray<HarnessV1StreamPart>;
  turn?: 'prompt' | 'continue';
}) {
  const { harness } = createFakeHarness({ parts });
  const wrapped = withGitHubCopilotGatewayModel({
    harness,
    gatewayModel: 'openai/gpt-5.5',
  });
  const session = await wrapped.doStart(
    {} as Parameters<HarnessV1['doStart']>[0],
  );
  const emitted: HarnessV1StreamPart[] = [];
  const options = {
    skills: [],
    tools: [],
    emit: (part: HarnessV1StreamPart) => emitted.push(part),
  };
  if (turn === 'prompt') {
    await session.doPromptTurn({ ...options, prompt: 'Hello' });
  } else {
    await session.doContinueTurn(options);
  }
  return emitted;
}

describe('withGitHubCopilotGatewayModel', () => {
  it('fills in the gateway model when stream-start reports no model', async () => {
    expect(
      await collectPromptTurnParts({ parts: [{ type: 'stream-start' }] }),
    ).toEqual([{ type: 'stream-start', modelId: 'openai/gpt-5.5' }]);
  });

  it('keeps a model reported by the ACP bridge', async () => {
    expect(
      await collectPromptTurnParts({
        parts: [{ type: 'stream-start', modelId: 'claude-sonnet-5' }],
      }),
    ).toEqual([{ type: 'stream-start', modelId: 'claude-sonnet-5' }]);
  });

  it('fills in the gateway model for continued turns', async () => {
    expect(
      await collectPromptTurnParts({
        parts: [{ type: 'stream-start' }],
        turn: 'continue',
      }),
    ).toEqual([{ type: 'stream-start', modelId: 'openai/gpt-5.5' }]);
  });

  it('forwards other parts unchanged', async () => {
    const textStart = { type: 'text-start', id: 'text-1' } as const;
    expect(await collectPromptTurnParts({ parts: [textStart] })).toEqual([
      textStart,
    ]);
  });

  it('preserves the wrapped harness and session properties', async () => {
    const { harness } = createFakeHarness({ parts: [] });
    const wrapped = withGitHubCopilotGatewayModel({
      harness,
      gatewayModel: 'openai/gpt-5.5',
    });
    const session = await wrapped.doStart(
      {} as Parameters<HarnessV1['doStart']>[0],
    );

    expect(wrapped.harnessId).toBe('github-copilot');
    expect(session.sessionId).toBe('session-1');
    expect(session.isResume).toBe(false);
  });
});
