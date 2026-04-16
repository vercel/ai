import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { isToolApprovalNeeded } from './is-tool-approval-needed';

describe('isToolApprovalNeeded', () => {
  const messages = [{ role: 'user', content: 'hello' }] as const;
  const context = { requestId: 'req-1' };

  it('returns false when neither user-defined nor tool-defined approval is configured', async () => {
    const result = await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
        }),
      },
      toolNeedsApproval: undefined,
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        dynamic: false,
      },
      messages: [...messages],
      context,
    });

    expect(result).toBe(false);
  });

  it('uses user-defined approval before tool-defined approval', async () => {
    const toolNeedsApproval = vi.fn(() => false);
    const userDefinedNeedsApproval = vi.fn(() => true);

    const result = await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: toolNeedsApproval,
        }),
      },
      toolNeedsApproval: {
        weather: userDefinedNeedsApproval,
      },
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        dynamic: false,
      },
      messages: [...messages],
      context,
    });

    expect(result).toBe(true);
    expect(userDefinedNeedsApproval).toHaveBeenCalledTimes(1);
    expect(toolNeedsApproval).not.toHaveBeenCalled();
  });

  it('passes tool input and options to a user-defined approval callback', async () => {
    const userDefinedNeedsApproval = vi.fn(() => true);

    await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
        }),
      },
      toolNeedsApproval: {
        weather: userDefinedNeedsApproval,
      },
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        dynamic: false,
      },
      messages: [...messages],
      context,
    });

    expect(userDefinedNeedsApproval).toHaveBeenCalledWith(
      { city: 'Berlin' },
      {
        toolCallId: 'call-1',
        messages: [...messages],
        context,
      },
    );
  });

  it('uses tool-defined approval when no user-defined approval is configured', async () => {
    const toolNeedsApproval = vi.fn(() => true);

    const result = await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: toolNeedsApproval,
        }),
      },
      toolNeedsApproval: undefined,
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        dynamic: false,
      },
      messages: [...messages],
      context,
    });

    expect(result).toBe(true);
    expect(toolNeedsApproval).toHaveBeenCalledWith(
      { city: 'Berlin' },
      {
        toolCallId: 'call-1',
        messages: [...messages],
        context,
      },
    );
  });
});
