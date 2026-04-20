import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { TypeValidationError } from '../error';
import { isToolApprovalNeeded } from './is-tool-approval-needed';

describe('isToolApprovalNeeded', () => {
  const messages = [{ role: 'user', content: 'hello' }] as const;

  it('returns false when neither user-defined nor tool-defined approval is configured', async () => {
    const result = await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
        }),
      },
      toolApproval: undefined,
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        dynamic: false,
      },
      messages: [...messages],
      toolsContext: {},
    });

    expect(result).toBe(false);
  });

  it('uses user-defined approval before tool-defined approval', async () => {
    const toolApproval = vi.fn(() => false);
    const userDefinedNeedsApproval = vi.fn(() => true);

    const result = await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: toolApproval,
        }),
      },
      toolApproval: {
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
      toolsContext: {},
    });

    expect(result).toBe(true);
    expect(userDefinedNeedsApproval).toHaveBeenCalledTimes(1);
    expect(toolApproval).not.toHaveBeenCalled();
  });

  it('passes tool input and options to a user-defined approval callback', async () => {
    const userDefinedNeedsApproval = vi.fn(() => true);

    await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
        }),
      },
      toolApproval: {
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
      toolsContext: {},
    });

    expect(userDefinedNeedsApproval).toHaveBeenCalledWith(
      { city: 'Berlin' },
      {
        toolCallId: 'call-1',
        messages: [...messages],
      },
    );
  });

  it('uses tool-defined approval when no user-defined approval is configured', async () => {
    const toolApproval = vi.fn(() => true);

    const result = await isToolApprovalNeeded({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: toolApproval,
        }),
      },
      toolApproval: undefined,
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Berlin' },
        dynamic: false,
      },
      messages: [...messages],
      toolsContext: {},
    });

    expect(result).toBe(true);
    expect(toolApproval).toHaveBeenCalledWith(
      { city: 'Berlin' },
      {
        toolCallId: 'call-1',
        messages: [...messages],
      },
    );
  });

  it('throws TypeValidationError before invoking approval callbacks', async () => {
    const userDefinedNeedsApproval = vi.fn(() => true);

    try {
      await isToolApprovalNeeded({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            contextSchema: z.object({ apiKey: z.string() }),
            needsApproval: vi.fn(() => true),
          }),
        },
        toolApproval: {
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
        toolsContext: {
          weather: { apiKey: 123 } as any,
        },
      });

      expect.unreachable('expected isToolApprovalNeeded to throw');
    } catch (error) {
      expect(userDefinedNeedsApproval).not.toHaveBeenCalled();

      expect(TypeValidationError.isInstance(error)).toBe(true);

      if (TypeValidationError.isInstance(error)) {
        expect(error.value).toEqual({ apiKey: 123 });
        expect(error.context).toEqual({
          field: 'tool context',
          entityName: 'weather',
        });
      }
    }
  });
});
