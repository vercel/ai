import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { PiSessionEvent } from './pi-events';
import { createPiTurnSettle } from './pi-turn-settle';

const toolEvent = { toolCallId: 'tool-1', toolName: 'bash' };
const assistant = { role: 'assistant', content: [] };

function loadExtension(settle: ReturnType<typeof createPiTurnSettle>) {
  const handlers = new Map<string, (event: unknown) => unknown>();
  const api = {
    on: vi.fn((type: string, handler: (event: unknown) => unknown) => {
      handlers.set(type, handler);
    }),
  } as unknown as ExtensionAPI;
  void settle.extension(api);
  return handlers;
}

async function settledWithin(promise: Promise<void>, ms: number) {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await new Promise(resolve => setTimeout(resolve, ms));
  return settled;
}

describe('createPiTurnSettle', () => {
  it('lets tool calls through until a settle begins, then blocks them', async () => {
    const settle = createPiTurnSettle({ timeoutMs: 1000 });
    const toolCall = loadExtension(settle).get('tool_call')!;
    expect(toolCall({ type: 'tool_call', ...toolEvent })).toBeUndefined();

    await settle.settle();

    expect(toolCall({ type: 'tool_call', ...toolEvent })).toEqual({
      block: true,
      reason:
        'The session is pausing. Continue this work when the turn resumes.',
    });
  });

  it('resolves when the running tool ends', async () => {
    const settle = createPiTurnSettle({ timeoutMs: 10_000 });
    settle.observe({
      type: 'tool_execution_start',
      ...toolEvent,
    } as PiSessionEvent);

    const settled = settle.settle();
    expect(await settledWithin(settled, 20)).toBe(false);

    settle.observe({
      type: 'tool_execution_end',
      ...toolEvent,
    } as PiSessionEvent);
    expect(await settledWithin(settled, 20)).toBe(true);
  });

  it('waits for a streaming assistant message to end', async () => {
    const settle = createPiTurnSettle({ timeoutMs: 10_000 });
    settle.observe({
      type: 'message_start',
      message: assistant,
    } as PiSessionEvent);

    const settled = settle.settle();
    expect(await settledWithin(settled, 20)).toBe(false);

    settle.observe({
      type: 'message_end',
      message: assistant,
    } as PiSessionEvent);
    expect(await settledWithin(settled, 20)).toBe(true);
  });

  it('gives up after the bound when a tool keeps running', async () => {
    const settle = createPiTurnSettle({ timeoutMs: 30 });
    settle.observe({
      type: 'tool_execution_start',
      ...toolEvent,
    } as PiSessionEvent);

    expect(await settledWithin(settle.settle(), 80)).toBe(true);
  });
});
