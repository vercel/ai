import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import type * as acp from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  assertACPResumeCapability,
  createACPRecoveredSession,
  createACPRecoveredSessionUpdates,
} from './recovered-session';

describe('ACP recovered session', () => {
  it('requires advertised session resume instead of creating a fresh conversation', () => {
    expect(() =>
      assertACPResumeCapability({
        initialization: {
          protocolVersion: 1,
          agentCapabilities: { sessionCapabilities: {} },
        },
        harnessId: 'codex-acp',
      }),
    ).toThrow(HarnessCapabilityUnsupportedError);
    expect(() =>
      assertACPResumeCapability({
        initialization: {
          protocolVersion: 1,
          agentCapabilities: {
            sessionCapabilities: { resume: {} },
          },
        },
        harnessId: 'codex-acp',
      }),
    ).not.toThrow();
  });

  it('routes resumed-session updates and the prompt stop through one queue', async () => {
    let resolvePrompt!: (response: acp.PromptResponse) => void;
    const promptResponse = new Promise<acp.PromptResponse>(resolve => {
      resolvePrompt = resolve;
    });
    const request = vi.fn(() => promptResponse);
    const updates = createACPRecoveredSessionUpdates();
    const session = createACPRecoveredSession({
      agent: { request } as unknown as acp.ClientContext,
      sessionId: 'session-42',
      restorationResponse: {
        modes: {
          currentModeId: 'agent',
          availableModes: [],
        },
      },
      updates,
    });
    const promptPromise = session.prompt([
      { type: 'text', text: 'Continue the interrupted work.' },
    ]);
    updates.enqueue({
      kind: 'session_update',
      notification: {
        sessionId: 'session-42',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'working' },
        },
      },
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'working' },
      },
    });
    await expect(session.nextUpdate()).resolves.toMatchObject({
      kind: 'session_update',
      update: {
        sessionUpdate: 'agent_message_chunk',
      },
    });
    resolvePrompt({ stopReason: 'end_turn' });
    await promptPromise;
    await expect(session.nextUpdate()).resolves.toMatchObject({
      kind: 'stop',
      stopReason: 'end_turn',
    });
    expect(request).toHaveBeenCalledWith('session/prompt', {
      sessionId: 'session-42',
      prompt: [{ type: 'text', text: 'Continue the interrupted work.' }],
    });
    session.dispose();
    await expect(session.nextUpdate()).rejects.toThrow(
      'Recovered ACP session disposed.',
    );
  });
});
